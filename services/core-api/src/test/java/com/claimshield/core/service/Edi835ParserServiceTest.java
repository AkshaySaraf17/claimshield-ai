package com.claimshield.core.service;

import com.claimshield.core.service.Edi835ParserService.ClaimRemittance;
import com.claimshield.core.service.Edi835ParserService.ParsedERA;
import com.claimshield.core.service.Edi835ParserService.ServiceLine;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** One-to-one port of tests/test_edi835.py (the Python claims service's EDI 835 parser tests). */
class Edi835ParserServiceTest {

    static final String SAMPLE_835 = Edi835ParserServiceTestFixtures.SAMPLE_835;

    private final Edi835ParserService parser = new Edi835ParserService();

    private ParsedERA era() { return parser.parse835(SAMPLE_835); }

    private ClaimRemittance claim() { return era().claims().get(0); }

    @Nested
    class DollarsToCents {
        @Test void basic() { assertThat(Edi835ParserService.dollarsToCents("150.00")).isEqualTo(15000); }
        @Test void zero() { assertThat(Edi835ParserService.dollarsToCents("0")).isZero(); }
        @Test void largeAmount() { assertThat(Edi835ParserService.dollarsToCents("12345.67")).isEqualTo(1234567); }
        @Test void invalid() { assertThat(Edi835ParserService.dollarsToCents("abc")).isZero(); }
        @Test void empty() { assertThat(Edi835ParserService.dollarsToCents("")).isZero(); }
    }

    @Nested
    class ParseDate {
        @Test void valid() { assertThat(Edi835ParserService.parseDate("20231015")).isEqualTo(LocalDate.of(2023, 10, 15)); }
        @Test void invalid() { assertThat(Edi835ParserService.parseDate("notadate")).isNull(); }
        @Test void empty() { assertThat(Edi835ParserService.parseDate("")).isNull(); }
        @Test void tooShort() { assertThat(Edi835ParserService.parseDate("2023")).isNull(); }
    }

    @Nested
    class Parse835 {
        @Test void parsesPayer() { assertThat(era().payerName()).isEqualTo("Aetna Insurance"); }
        @Test void parsesPayee() { assertThat(era().payeeName()).isEqualTo("Synthetic Medical Group"); }
        @Test void parsesCheckNumber() { assertThat(era().checkNumber()).isEqualTo("TRACE123"); }
        @Test void parsesTotalPaid() { assertThat(era().totalPaidCents()).isEqualTo(150000); }
        @Test void parsesOneClaim() { assertThat(era().claims()).hasSize(1); }
        @Test void claimId() { assertThat(claim().claimId()).isEqualTo("CLM-001"); }

        @Test
        void claimCharges() {
            ClaimRemittance c = claim();
            assertThat(c.totalChargeCents()).isEqualTo(250000);
            assertThat(c.totalPaidCents()).isEqualTo(150000);
            assertThat(c.patientResponsibilityCents()).isEqualTo(50000);
        }

        @Test void claimPatientName() { assertThat(claim().patientName()).isEqualTo("DOE, JOHN"); }
        @Test void serviceLines() { assertThat(claim().serviceLines()).hasSize(2); }

        @Test
        void serviceProcedureCodes() {
            List<ServiceLine> svcs = claim().serviceLines();
            assertThat(svcs.get(0).procedureCode()).isEqualTo("99214");
            assertThat(svcs.get(1).procedureCode()).isEqualTo("99213");
            assertThat(svcs.get(1).modifier()).isEqualTo("59");
        }

        @Test
        void serviceAmounts() {
            ServiceLine svc = claim().serviceLines().get(0);
            assertThat(svc.chargeAmountCents()).isEqualTo(25000);
            assertThat(svc.paidAmountCents()).isEqualTo(15000);
        }

        @Test
        void adjustments() {
            ServiceLine svc0 = claim().serviceLines().get(0);
            assertThat(svc0.adjustments()).hasSize(1);
            assertThat(svc0.adjustments().get(0).groupCode()).isEqualTo("CO");
            assertThat(svc0.adjustments().get(0).reasonCode()).isEqualTo("50");
            assertThat(svc0.adjustments().get(0).amountCents()).isEqualTo(10000);
        }

        @Test void denialCodes() { assertThat(claim().denialCodes()).contains("CO-50", "CO-97"); }
        @Test void remarkCodes() { assertThat(claim().allRemarkCodes()).contains("N115"); }

        @Test
        void dateOfService() {
            assertThat(claim().serviceLines().get(0).dateOfService()).isEqualTo(LocalDate.of(2023, 9, 1));
        }

        @Test
        void totalDenied() {
            ClaimRemittance c = claim();
            assertThat(c.totalDeniedCents()).isEqualTo(c.totalChargeCents() - c.totalPaidCents() - c.patientResponsibilityCents());
        }
    }

    @Nested
    class EraToSummaries {
        private List<Map<String, Object>> summaries() { return parser.eraToSummaries(era()); }

        @Test void producesSummaries() { assertThat(summaries()).hasSize(1); }

        @Test
        @SuppressWarnings("unchecked")
        void summaryFields() {
            Map<String, Object> s = summaries().get(0);
            assertThat(s.get("claim_id")).isEqualTo("CLM-001");
            assertThat(s.get("payer_name")).isEqualTo("Aetna Insurance");
            assertThat(s.get("denial_code")).isEqualTo("CO-50");
            assertThat((List<String>) s.get("denial_codes_all")).contains("CO-97");
            assertThat((Long) s.get("amount_denied_cents")).isPositive();
            assertThat((List<?>) s.get("service_lines")).hasSize(2);
        }

        @Test
        @SuppressWarnings("unchecked")
        void summaryServiceLineDetail() {
            Map<String, Object> svc = ((List<Map<String, Object>>) summaries().get(0).get("service_lines")).get(0);
            assertThat(svc.get("procedure_code")).isEqualTo("99214");
            assertThat(svc.get("charge_cents")).isEqualTo(25000L);
            assertThat((List<?>) svc.get("adjustments")).hasSize(1);
        }
    }

    @Test
    void centsUseExactDecimalArithmetic() {
        // Float maths gets these wrong (e.g. 0.29 * 100 = 28.999999999999996); exact decimals must not
        assertThat(Edi835ParserService.dollarsToCents("0.29")).isEqualTo(29);
        assertThat(Edi835ParserService.dollarsToCents("1005.07")).isEqualTo(100507);
        assertThat(Edi835ParserService.dollarsToCents(" 12.30 ")).isEqualTo(1230);
        assertThat(Edi835ParserService.dollarsToCents(null)).isZero();
    }
}
