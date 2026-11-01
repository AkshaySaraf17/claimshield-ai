package com.claimshield.core.service;

import com.claimshield.core.model.Document;
import com.claimshield.core.repository.DocumentRepository;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.ss.usermodel.*;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class DocumentService {

    private final DocumentRepository documentRepository;

    public DocumentService(DocumentRepository documentRepository) {
        this.documentRepository = documentRepository;
    }

    public Document uploadAndExtract(MultipartFile file, String tenantId, String userId, String claimId) {
        String fileName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown";
        String fileType = getFileType(fileName);

        Document doc = new Document();
        doc.setId(UUID.randomUUID().toString());
        doc.setTenantId(tenantId);
        doc.setClaimId(claimId);
        doc.setFileName(fileName);
        doc.setFileType(fileType);
        doc.setFileSizeBytes(file.getSize());
        doc.setUploadedBy(userId);
        doc.setCreatedAt(LocalDateTime.now());

        try {
            String text = extractText(file, fileType);
            doc.setExtractedText(text);
            doc.setExtractionStatus("completed");
            doc.setExtractionConfidence(1.0);
        } catch (Exception e) {
            doc.setExtractedText("Extraction failed: " + e.getMessage());
            doc.setExtractionStatus("failed");
            doc.setExtractionConfidence(0.0);
        }

        return documentRepository.save(doc);
    }

    private String extractText(MultipartFile file, String fileType) throws Exception {
        return switch (fileType) {
            case "pdf" -> extractFromPdf(file.getInputStream());
            case "docx" -> extractFromDocx(file.getInputStream());
            case "xlsx", "xls" -> extractFromExcel(file.getInputStream());
            case "txt", "csv" -> new String(file.getBytes(), StandardCharsets.UTF_8);
            default -> throw new IllegalArgumentException("Unsupported file type: " + fileType);
        };
    }

    private String extractFromPdf(InputStream is) throws Exception {
        try (PDDocument pdf = Loader.loadPDF(is.readAllBytes())) {
            PDFTextStripper stripper = new PDFTextStripper();
            return stripper.getText(pdf);
        }
    }

    private String extractFromDocx(InputStream is) throws Exception {
        try (XWPFDocument docx = new XWPFDocument(is)) {
            return docx.getParagraphs().stream()
                    .map(XWPFParagraph::getText)
                    .collect(Collectors.joining("\n"));
        }
    }

    private String extractFromExcel(InputStream is) throws Exception {
        StringBuilder sb = new StringBuilder();
        try (Workbook workbook = new XSSFWorkbook(is)) {
            DataFormatter formatter = new DataFormatter();
            for (Sheet sheet : workbook) {
                sb.append("--- Sheet: ").append(sheet.getSheetName()).append(" ---\n");
                for (Row row : sheet) {
                    for (Cell cell : row) {
                        sb.append(formatter.formatCellValue(cell)).append("\t");
                    }
                    sb.append("\n");
                }
            }
        }
        return sb.toString();
    }

    private String getFileType(String fileName) {
        int dot = fileName.lastIndexOf('.');
        if (dot < 0) return "unknown";
        return fileName.substring(dot + 1).toLowerCase();
    }

    public List<Document> listByTenant(String tenantId) {
        return documentRepository.findByTenantIdOrderByCreatedAtDesc(tenantId);
    }

    public List<Document> listByClaim(String claimId) {
        return documentRepository.findByClaimIdOrderByCreatedAtDesc(claimId);
    }
}
