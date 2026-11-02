package com.claimshield.core.service;

import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class Edi835ParserService {

    public record ServiceAdjustment(String groupCode, String reasonCode, long amountCents, int quantity) {}
    public record ServiceLine(String procedureCode, String modifier, long chargeAmountCents,
                              long paidAmountCents, List<ServiceAdjustment> adjustments,
                              LocalDate dateOfService, List<String> remarkCodes) {}
    public record ClaimRemittance(String claimId, String patientName, String payerName,
                                  String payeeName, String claimStatus, long totalChargeCents,
                                  long totalPaidCents, long patientResponsibilityCents,
                                  List<ServiceLine> serviceLines, String filingIndicator) {
        public long totalDeniedCents() {
            return totalChargeCents - totalPaidCents - patientResponsibilityCents;
        }
        public List<String> denialCodes() {
            List<String> codes = new ArrayList<>();
            for (ServiceLine svc : serviceLines) {
                for (ServiceAdjustment adj : svc.adjustments()) {
                    String code = adj.groupCode() + "-" + adj.reasonCode();
                    if (!codes.contains(code)) codes.add(code);
                }
            }
            return codes;
        }
        public List<String> allRemarkCodes() {
            List<String> codes = new ArrayList<>();
            for (ServiceLine svc : serviceLines) {
                for (String rc : svc.remarkCodes()) {
                    if (!codes.contains(rc)) codes.add(rc);
                }
            }
            return codes;
        }
    }
    public record ParsedERA(String payerName, String payeeName, String checkNumber,
                            LocalDate checkDate, long totalPaidCents,
                            List<ClaimRemittance> claims, int rawSegmentCount,
                            List<String> errors) {}

    private static long dollarsToCents(String amountStr) {
        try {
            return Math.round(Double.parseDouble(amountStr) * 100);
        } catch (NumberFormatException | NullPointerException e) {
            return 0;
        }
    }

    private static LocalDate parseDate(String dateStr) {
        if (dateStr == null || dateStr.length() != 8) return null;
        try {
            return LocalDate.parse(dateStr, DateTimeFormatter.BASIC_ISO_DATE);
        } catch (Exception e) {
            return null;
        }
    }

    public ParsedERA parse835(String raw) {
        raw = raw.strip();

        String terminator = "~";
        if (raw.startsWith("ISA") && raw.length() >= 106) {
            terminator = String.valueOf(raw.charAt(105));
        }

        String[] segments;
        if ("\n".equals(terminator) || (raw.contains("\n") && !raw.contains("~"))) {
            segments = Arrays.stream(raw.split("\n")).map(String::strip).filter(s -> !s.isEmpty()).toArray(String[]::new);
        } else {
            segments = Arrays.stream(raw.split(java.util.regex.Pattern.quote(terminator)))
                    .map(String::strip).filter(s -> !s.isEmpty()).toArray(String[]::new);
        }

        String elementSep = "*";
        if (segments.length > 0 && segments[0].startsWith("ISA") && segments[0].length() > 3) {
            elementSep = String.valueOf(segments[0].charAt(3));
        }

        String payerName = null, payeeName = null, checkNumber = null;
        LocalDate checkDate = null;
        long totalPaidCents = 0;
        List<ClaimRemittance> claims = new ArrayList<>();
        List<String> errors = new ArrayList<>();

        // Mutable state for current claim/service being parsed
        String curClaimId = null, curPatientName = null, curClaimStatus = null, curFilingIndicator = null;
        long curChargeCents = 0, curPaidCents = 0, curPatientResp = 0;
        List<ServiceLine> curServiceLines = new ArrayList<>();
        boolean inClaim = false;

        String curSvcProc = null, curSvcMod = null;
        long curSvcCharge = 0, curSvcPaid = 0;
        List<ServiceAdjustment> curAdj = new ArrayList<>();
        LocalDate curSvcDate = null;
        List<String> curRemarks = new ArrayList<>();
        boolean inService = false;

        for (String seg : segments) {
            String[] elements = seg.split(java.util.regex.Pattern.quote(elementSep), -1);
            String segId = elements.length > 0 ? elements[0] : "";

            switch (segId) {
                case "N1" -> {
                    String qualifier = elements.length > 1 ? elements[1] : "";
                    String name = elements.length > 2 ? elements[2] : "";
                    if ("PR".equals(qualifier)) payerName = name;
                    else if ("PE".equals(qualifier)) payeeName = name;
                }
                case "BPR" -> {
                    if (elements.length > 2) totalPaidCents = dollarsToCents(elements[2]);
                    if (elements.length > 16) checkDate = parseDate(elements[16]);
                }
                case "TRN" -> {
                    if (elements.length > 2) checkNumber = elements[2];
                }
                case "CLP" -> {
                    if (inClaim) {
                        if (inService) {
                            curServiceLines.add(new ServiceLine(curSvcProc, curSvcMod, curSvcCharge, curSvcPaid, List.copyOf(curAdj), curSvcDate, List.copyOf(curRemarks)));
                            inService = false;
                        }
                        claims.add(new ClaimRemittance(curClaimId, curPatientName, payerName, payeeName,
                                curClaimStatus, curChargeCents, curPaidCents, curPatientResp,
                                List.copyOf(curServiceLines), curFilingIndicator));
                    }
                    inClaim = true;
                    curServiceLines = new ArrayList<>();
                    curClaimId = elements.length > 1 ? elements[1] : null;
                    curClaimStatus = elements.length > 2 ? elements[2] : null;
                    curChargeCents = elements.length > 3 ? dollarsToCents(elements[3]) : 0;
                    curPaidCents = elements.length > 4 ? dollarsToCents(elements[4]) : 0;
                    curPatientResp = elements.length > 5 && !elements[5].isEmpty() ? dollarsToCents(elements[5]) : 0;
                    curFilingIndicator = elements.length > 6 ? elements[6] : null;
                    curPatientName = null;
                }
                case "NM1" -> {
                    if (inClaim) {
                        String qual = elements.length > 1 ? elements[1] : "";
                        if ("QC".equals(qual)) {
                            String last = elements.length > 3 ? elements[3] : "";
                            String first = elements.length > 4 ? elements[4] : "";
                            curPatientName = (last + ", " + first).replaceAll("^[, ]+|[, ]+$", "");
                        }
                    }
                }
                case "SVC" -> {
                    if (inService) {
                        curServiceLines.add(new ServiceLine(curSvcProc, curSvcMod, curSvcCharge, curSvcPaid, List.copyOf(curAdj), curSvcDate, List.copyOf(curRemarks)));
                    }
                    inService = true;
                    curAdj = new ArrayList<>();
                    curRemarks = new ArrayList<>();
                    curSvcDate = null;
                    if (elements.length > 1) {
                        String[] parts = elements[1].split(":");
                        curSvcProc = parts.length >= 2 ? parts[1] : null;
                        curSvcMod = parts.length >= 3 ? parts[2] : null;
                    }
                    curSvcCharge = elements.length > 2 ? dollarsToCents(elements[2]) : 0;
                    curSvcPaid = elements.length > 3 ? dollarsToCents(elements[3]) : 0;
                }
                case "CAS" -> {
                    if (inService && elements.length >= 4) {
                        String groupCode = elements[1];
                        int i = 2;
                        while (i + 1 < elements.length) {
                            String reason = !elements[i].isEmpty() ? elements[i] : null;
                            long amount = i + 1 < elements.length ? dollarsToCents(elements[i + 1]) : 0;
                            int qty = i + 2 < elements.length && !elements[i + 2].isEmpty() ? Integer.parseInt(elements[i + 2]) : 0;
                            if (reason != null) {
                                curAdj.add(new ServiceAdjustment(groupCode, reason, amount, qty));
                            }
                            i += 3;
                        }
                    }
                }
                case "DTM" -> {
                    if (inService) {
                        String qual = elements.length > 1 ? elements[1] : "";
                        if ("472".equals(qual) && elements.length > 2) {
                            curSvcDate = parseDate(elements[2]);
                        }
                    }
                }
                case "LQ" -> {
                    if (inService && elements.length > 2) {
                        curRemarks.add(elements[2]);
                    }
                }
            }
        }

        if (inService) {
            curServiceLines.add(new ServiceLine(curSvcProc, curSvcMod, curSvcCharge, curSvcPaid, List.copyOf(curAdj), curSvcDate, List.copyOf(curRemarks)));
        }
        if (inClaim) {
            claims.add(new ClaimRemittance(curClaimId, curPatientName, payerName, payeeName,
                    curClaimStatus, curChargeCents, curPaidCents, curPatientResp,
                    List.copyOf(curServiceLines), curFilingIndicator));
        }

        return new ParsedERA(payerName, payeeName, checkNumber, checkDate, totalPaidCents,
                claims, segments.length, errors);
    }

    public List<Map<String, Object>> eraToSummaries(ParsedERA era) {
        List<Map<String, Object>> summaries = new ArrayList<>();
        for (ClaimRemittance claim : era.claims()) {
            List<String> denialCodes = claim.denialCodes();
            String primaryCode = denialCodes.isEmpty() ? null : denialCodes.get(0);

            List<Map<String, Object>> svcLines = claim.serviceLines().stream().map(svc -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("procedure_code", svc.procedureCode());
                m.put("modifier", svc.modifier());
                m.put("charge_cents", svc.chargeAmountCents());
                m.put("paid_cents", svc.paidAmountCents());
                m.put("date_of_service", svc.dateOfService() != null ? svc.dateOfService().toString() : null);
                m.put("adjustments", svc.adjustments().stream().map(a ->
                        Map.of("group", a.groupCode(), "reason", a.reasonCode(), "amount_cents", a.amountCents())
                ).toList());
                return m;
            }).toList();

            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("claim_id", claim.claimId());
            summary.put("patient_name", claim.patientName());
            summary.put("payer_name", claim.payerName() != null ? claim.payerName() : era.payerName());
            summary.put("denial_code", primaryCode);
            summary.put("denial_codes_all", denialCodes);
            summary.put("remark_codes", claim.allRemarkCodes());
            summary.put("amount_denied_cents", claim.totalDeniedCents());
            summary.put("total_charge_cents", claim.totalChargeCents());
            summary.put("total_paid_cents", claim.totalPaidCents());
            summary.put("patient_responsibility_cents", claim.patientResponsibilityCents());
            summary.put("service_lines", svcLines);
            summaries.add(summary);
        }
        return summaries;
    }
}
