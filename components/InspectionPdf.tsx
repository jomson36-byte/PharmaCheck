import type { Font as FontkitFont } from "fontkit";
import {
  Document,
  Font,
  Image,
  Page,
  pdf,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { Answer, Inspection, InspectionSignatureRole, ResponsiblePerson } from "@/lib/models";
import { categories, questions, questionsByCategory } from "@/lib/questions";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

Font.register({
  family: "SarabunPdf",
  fonts: [
    { src: `${basePath}/fonts/Sarabun-Regular.ttf`, fontWeight: 400 },
    { src: `${basePath}/fonts/Sarabun-Bold.ttf`, fontWeight: 700 },
  ],
});

Font.registerHyphenationCallback((word) => [word]);

const colors = {
  ink: "#000000",
  primary: "#000000",
  line: "#000000",
  muted: "#000000",
  pale: "#ffffff",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingRight: 42,
    paddingBottom: 38,
    paddingLeft: 42,
    color: colors.ink,
    fontFamily: "SarabunPdf",
    fontSize: 9,
    lineHeight: 1.42,
  },
  surveyPage: { paddingTop: 34 },
  titleRule: { height: 0.8, backgroundColor: colors.ink },
  documentTitle: { marginTop: 16, marginBottom: 1, paddingRight: 2, textAlign: "center", fontSize: 15, fontWeight: 700, lineHeight: 1.25 },
  documentSubtitle: { marginBottom: 4, paddingRight: 2, textAlign: "center", fontSize: 15, fontWeight: 700, lineHeight: 1.25 },
  documentLegal: { marginHorizontal: 28, marginTop: 2, marginBottom: 16, paddingRight: 2, textAlign: "center", fontSize: 9, fontWeight: 700, lineHeight: 1.35, color: colors.muted },
  revision: { position: "absolute", top: 22, right: 42, fontSize: 7, color: colors.muted },
  sectionTitle: { marginTop: 16, marginBottom: 7, fontSize: 11, fontWeight: 700, color: colors.primary },
  detailsGrid: { flexDirection: "row", flexWrap: "wrap", columnGap: 16 },
  detail: { width: "48%", flexDirection: "row", alignItems: "flex-end", marginBottom: 6 },
  detailWide: { width: "100%" },
  detailLabel: { marginRight: 6, paddingRight: 2, fontSize: 7.5, color: colors.muted },
  detailValue: { flexGrow: 1, minHeight: 15, paddingRight: 2, paddingBottom: 2, borderBottomWidth: 0.6, borderBottomStyle: "dotted", borderBottomColor: colors.line, fontSize: 8.5, fontWeight: 700 },
  personList: { marginTop: 3 },
  personLine: { marginBottom: 3 },
  categoryRow: { minHeight: 28, flexDirection: "row", borderRightWidth: 0.65, borderBottomWidth: 0.65, borderLeftWidth: 0.65, borderColor: colors.line, backgroundColor: "#ffffff" },
  categoryTitleCell: { width: "56%", paddingVertical: 5, paddingHorizontal: 6, fontSize: 9, fontWeight: 700 },
  categoryScoreCell: { width: "6%", borderLeftWidth: 0.65, borderLeftColor: colors.line },
  categoryWeightCell: { width: "10%", borderLeftWidth: 0.65, borderLeftColor: colors.line },
  categoryResultCell: { width: "10%", borderLeftWidth: 0.65, borderLeftColor: colors.line },
  tableHeader: { minHeight: 42, flexDirection: "row", alignItems: "stretch", borderTopWidth: 0.65, borderRightWidth: 0.65, borderBottomWidth: 0.65, borderLeftWidth: 0.65, borderColor: colors.line, backgroundColor: colors.pale },
  tableHeaderText: { paddingVertical: 3, paddingHorizontal: 2, fontSize: 6.2, fontWeight: 700, lineHeight: 1.2, textAlign: "center", textAlignVertical: "center" },
  questionHeader: { width: "56%", justifyContent: "center" },
  scoreHeader: { width: "6%", borderLeftWidth: 0.65, borderLeftColor: colors.line },
  weightHeader: { width: "10%", borderLeftWidth: 0.65, borderLeftColor: colors.line },
  resultHeader: { width: "10%", borderLeftWidth: 0.65, borderLeftColor: colors.line },
  questionRow: { flexDirection: "row", borderRightWidth: 0.65, borderBottomWidth: 0.65, borderLeftWidth: 0.65, borderColor: colors.line },
  questionCell: { width: "56%", flexDirection: "row", paddingVertical: 4, paddingHorizontal: 5 },
  questionCode: { width: 25, paddingRight: 2, color: colors.primary, fontSize: 7.5, fontWeight: 700 },
  questionBody: { flexGrow: 1, flexBasis: 0 },
  questionText: { paddingRight: 2, fontSize: 7.4, lineHeight: 1.36 },
  scoreCell: { width: "6%", paddingVertical: 4, borderLeftWidth: 0.65, borderLeftColor: colors.line, fontSize: 9, textAlign: "center", textAlignVertical: "center" },
  scoreSelected: { fontSize: 12, fontWeight: 700 },
  scoreUnavailable: { color: "#000000" },
  weightCell: { width: "10%", paddingVertical: 4, borderLeftWidth: 0.65, borderLeftColor: colors.line, fontSize: 8.5, textAlign: "center", textAlignVertical: "center" },
  resultCell: { width: "10%", paddingVertical: 4, borderLeftWidth: 0.65, borderLeftColor: colors.line, fontSize: 8.5, textAlign: "center", textAlignVertical: "center" },
  categorySummary: { flexDirection: "row", borderRightWidth: 0.65, borderBottomWidth: 0.65, borderLeftWidth: 0.65, borderColor: colors.line, minHeight: 25 },
  categorySummaryLabel: { width: "56%", paddingVertical: 4, paddingHorizontal: 5, fontSize: 7, fontWeight: 700 },
  categorySummaryValue: { width: "44%", paddingVertical: 4, paddingHorizontal: 5, borderLeftWidth: 0.65, borderLeftColor: colors.line, fontSize: 7, fontWeight: 700, textAlign: "center" },
  certificationTitle: { marginBottom: 5, paddingRight: 2, fontSize: 10, fontWeight: 700 },
  deficienciesBox: { minHeight: 66, padding: 8, borderWidth: 0.7, borderColor: colors.line },
  certificationStatement: { marginTop: 8, paddingTop: 7, paddingRight: 11, paddingBottom: 7, paddingLeft: 9, borderTopWidth: 0.7, borderBottomWidth: 0.7, borderColor: colors.line, backgroundColor: colors.pale, fontSize: 7.5, lineHeight: 1.5 },
  signatureGrid: { marginTop: 9, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  signatureBlock: { width: "47.5%", minHeight: 112, marginBottom: 7, paddingHorizontal: 6 },
  signatureHeading: { fontSize: 9.5, fontWeight: 700, color: colors.primary },
  signatureImageWrap: { height: 55, alignItems: "center", justifyContent: "flex-end", marginTop: 2 },
  signatureImage: { width: 150, height: 50, objectFit: "contain" },
  signatureLine: { borderTopWidth: 0.6, borderTopColor: colors.line, paddingTop: 2, color: colors.muted, fontSize: 6.5, textAlign: "center" },
  signatureName: { marginTop: 5, paddingBottom: 2, borderBottomWidth: 0.5, borderBottomStyle: "dotted", borderBottomColor: colors.line, fontSize: 8 },
  signedAt: { marginTop: 2, color: colors.primary, fontSize: 6 },
  footerLeft: { position: "absolute", bottom: 18, left: 42, color: colors.muted, fontSize: 6.5 },
  footerRight: { position: "absolute", right: 42, bottom: 18, color: colors.muted, fontSize: 6.5 },
  textEndGuard: { opacity: 0, fontSize: 2 },
});

const signatureRoles: Array<{ role: InspectionSignatureRole; label: string; required?: boolean }> = [
  { role: "licensee", label: "ผู้รับอนุญาต / ผู้ดำเนินกิจการ", required: true },
  { role: "duty_officer", label: "ผู้มีหน้าที่ปฏิบัติการ" },
  { role: "assessor_1", label: "ผู้ประเมิน ๑" },
  { role: "assessor_2", label: "ผู้ประเมิน ๒" },
  { role: "witness_1", label: "พยาน ๑" },
  { role: "witness_2", label: "พยาน ๒" },
];

const thaiDigitMap: Record<string, string> = {
  "0": "๐",
  "1": "๑",
  "2": "๒",
  "3": "๓",
  "4": "๔",
  "5": "๕",
  "6": "๖",
  "7": "๗",
  "8": "๘",
  "9": "๙",
};

const thaiSegmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("th", { granularity: "word" })
  : null;

type PdfFontMetrics = {
  regular: FontkitFont;
  bold: FontkitFont;
};

type WrapOptions = {
  maxWidth: number;
  fontSize: number;
  fontWeight?: 400 | 700;
};

const pageWidth = 595.28;
const pageHeight = 841.89;
const pageHorizontalPadding = 42;
const pageBottomPadding = 38;
const surveyPageTopPadding = 34;
const tableHeaderHeight = 42;
const surveyContentWidth = pageWidth - pageHorizontalPadding * 2;
const questionColumnWidth = surveyContentWidth * 0.56;
const questionTextWidth = questionColumnWidth - 5 * 2 - 25 - 2;
const surveyBodyHeight = pageHeight - surveyPageTopPadding - pageBottomPadding - tableHeaderHeight - 8;

function toThaiDigits(value: string | number) {
  return String(value).replace(/[0-9]/g, (digit) => thaiDigitMap[digit]);
}

function wrapThaiText(value: string | number) {
  return `${toThaiDigits(value)}\u00A0`;
}

function measureText(metrics: PdfFontMetrics, value: string, fontSize: number, fontWeight: 400 | 700 = 400) {
  const font = fontWeight === 700 ? metrics.bold : metrics.regular;
  return (font.layout(value).advanceWidth / font.unitsPerEm) * fontSize;
}

function wrapThaiLines(metrics: PdfFontMetrics, value: string | number, options: WrapOptions) {
  const text = toThaiDigits(value);
  if (!thaiSegmenter) return text;

  return text.split("\n").map((paragraph) => {
    const lines: string[] = [];
    let line = "";

    for (const entry of thaiSegmenter.segment(paragraph)) {
      const candidate = `${line}${entry.segment}`;
      if (line && measureText(metrics, candidate, options.fontSize, options.fontWeight) > options.maxWidth) {
        // Only insert a line break. Preserve every source character so the
        // post-layout integrity check can detect any genuine text loss.
        lines.push(line);
        line = entry.segment;
      } else {
        line = candidate;
      }
    }

    if (line || !lines.length) lines.push(line);
    return lines.join("\n");
  }).join("\n");
}

function protectPdfText(value: string) {
  return `${value}\u00A0`;
}

function TextEndGuard() {
  return <Text style={styles.textEndGuard}>.</Text>;
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH-u-nu-thai", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("th-TH-u-nu-thai", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function displayedRevision(inspection: Inspection) {
  const lastSyncedRevision = inspection.lastSyncedRevision ?? 0;
  return inspection.status === "SYNCED" ? Math.max(1, lastSyncedRevision) : lastSyncedRevision + 1;
}

function Footer({ inspection, pageNumber, totalPages }: { inspection: Inspection; pageNumber: number; totalPages: number }) {
  return (
    <>
      <Text style={styles.footerLeft}>PharmaCheck · Revision {toThaiDigits(displayedRevision(inspection))}</Text>
      <Text style={styles.footerRight}>หน้า {toThaiDigits(pageNumber)} / {toThaiDigits(totalPages)}</Text>
    </>
  );
}

function Detail({ label, value, metrics, wide = false }: { label: string; value?: string; metrics: PdfFontMetrics; wide?: boolean }) {
  const containerWidth = wide ? surveyContentWidth : surveyContentWidth * 0.48;
  const labelWidth = measureText(metrics, label, 7.5) + 8;
  const valueWidth = Math.max(40, containerWidth - labelWidth - 4);
  return (
    <View style={[styles.detail, wide ? styles.detailWide : {}]}>
      <Text style={styles.detailLabel}>{protectPdfText(label)}<TextEndGuard /></Text>
      <Text style={styles.detailValue}>{wrapThaiLines(metrics, value?.trim() || "-", { maxWidth: valueWidth, fontSize: 8.5, fontWeight: 700 })}<TextEndGuard /></Text>
    </View>
  );
}

function TableHeader({ metrics }: { metrics: PdfFontMetrics }) {
  return (
    <View style={styles.tableHeader}>
      <Text style={[styles.tableHeaderText, styles.questionHeader]}>{wrapThaiLines(metrics, "ข้อกำหนดตามประกาศฯ เรื่อง การกำหนดเกี่ยวกับสถานที่ อุปกรณ์ และวิธีปฏิบัติทางเภสัชกรรมชุมชน ในร้านขายยาแผนปัจจุบัน (ข.ย.๑)", { maxWidth: questionColumnWidth - 8, fontSize: 6.2, fontWeight: 700 })}<TextEndGuard /></Text>
      <Text style={[styles.tableHeaderText, styles.scoreHeader]}>ปรับปรุง{`\n`}(๐)</Text>
      <Text style={[styles.tableHeaderText, styles.scoreHeader]}>พอใช้{`\n`}(๑)</Text>
      <Text style={[styles.tableHeaderText, styles.scoreHeader]}>ดี{`\n`}(๒)</Text>
      <Text style={[styles.tableHeaderText, styles.scoreHeader]}>N/A</Text>
      <Text style={[styles.tableHeaderText, styles.weightHeader]}>ค่าน้ำหนัก{`\n`}คะแนน</Text>
      <Text style={[styles.tableHeaderText, styles.resultHeader]}>คะแนนที่ได้{`\n`}× ค่าน้ำหนัก</Text>
    </View>
  );
}

type PdfProps = {
  inspection: Inspection;
  answers: Answer[];
  responsiblePersons: ResponsiblePerson[];
};

type PreparedQuestion = {
  kind: "question";
  question: (typeof questions)[number];
  selectedValue: Answer["selectedValue"];
  text: string;
  height: number;
};

type CategoryItem = {
  kind: "category";
  code: string;
  name: string;
  height: number;
};

type SummaryItem = {
  kind: "summary";
  code: string;
  weightedScore: number;
  fullScore: number;
  height: number;
};

type SurveyItem = PreparedQuestion | CategoryItem | SummaryItem;

function prepareSurveyPages(metrics: PdfFontMetrics, answerByCode: Map<string, Answer>) {
  const pages: SurveyItem[][] = [];
  let page: SurveyItem[] = [];
  let usedHeight = 0;

  const pushPage = () => {
    if (page.length) pages.push(page);
    page = [];
    usedHeight = 0;
  };

  const addItem = (item: SurveyItem) => {
    if (page.length && usedHeight + item.height > surveyBodyHeight) pushPage();
    page.push(item);
    usedHeight += item.height;
  };

  for (const category of categories) {
    const categoryQuestions = questionsByCategory[category.code];
    const preparedQuestions = categoryQuestions.map((question): PreparedQuestion => {
      const text = wrapThaiLines(metrics, question.fullText, {
        // React-pdf's Thai shaping can be a few points wider than fontkit's
        // advance total after mark positioning. Keep a fixed safety inset so
        // the per-line end guard never pushes the final glyph outside the cell.
        maxWidth: questionTextWidth - 12,
        fontSize: 7.4,
      });
      const lineCount = text.split("\n").length;
      return {
        kind: "question",
        question,
        selectedValue: answerByCode.get(question.code)?.selectedValue ?? null,
        text,
        height: Math.max(24, lineCount * 7.4 * 1.36 + 8),
      };
    });

    const firstRowHeight = preparedQuestions[0]?.height ?? 0;
    if (page.length && usedHeight + 28 + firstRowHeight > surveyBodyHeight) pushPage();
    addItem({ kind: "category", code: category.code, name: category.name, height: 28 });
    preparedQuestions.forEach(addItem);

    const applicableQuestions = categoryQuestions.filter((question) => answerByCode.get(question.code)?.selectedValue !== "NA");
    const weightedScore = applicableQuestions.reduce((sum, question) => {
      const selectedValue = answerByCode.get(question.code)?.selectedValue;
      return sum + (typeof selectedValue === "number" ? selectedValue * question.weight : 0);
    }, 0);
    const fullScore = applicableQuestions.reduce((sum, question) => sum + 2 * question.weight, 0);
    addItem({ kind: "summary", code: category.code, weightedScore, fullScore, height: 25 });
  }

  pushPage();
  return pages;
}

function assertPreparedQuestionsComplete(pages: SurveyItem[][]) {
  const preparedQuestions = pages.flat().filter((item): item is PreparedQuestion => item.kind === "question");
  if (preparedQuestions.length !== questions.length) {
    throw new Error(`PDF layout contains ${preparedQuestions.length}/${questions.length} questions`);
  }

  for (const prepared of preparedQuestions) {
    const reconstructed = prepared.text.replace(/\n/g, "");
    const source = toThaiDigits(prepared.question.fullText).replace(/\n/g, "");
    if (reconstructed !== source) {
      throw new Error(`PDF text integrity check failed at question ${prepared.question.code}`);
    }
  }
}

function normalizeIntegrityText(value: string) {
  return value
    .normalize("NFC")
    // Sarabun's PDF ToUnicode map may expose SARA AM as U+0E33 followed by
    // a redundant SARA AA. They render as one glyph, so canonicalize both
    // source and extracted text before checking integrity.
    .replace(/\u0E33\u0E32/gu, "\u0E33")
    .replace(/([\u0E01-\u0E2E])([\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]+)/gu, (_, base: string, marks: string) => (
      `${base}${[...marks].sort((left, right) => left.codePointAt(0)! - right.codePointAt(0)!).join("")}`
    ))
    .replace(/[.\s\u200B-\u200D\uFEFF]/gu, "");
}

async function assertPdfQuestionsComplete(blob: Blob, pages: SurveyItem[][]) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = `${basePath}/pdf.worker.min.mjs`;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
  });
  const document = await loadingTask.promise;
  const pageTexts: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      // pdf.js getTextContent() consumes the stream with `for await`, but
      // older Safari/iPadOS exposes ReadableStream without an async iterator.
      // Reading through getReader() works across those Safari versions.
      const reader = page.streamTextContent().getReader();
      const textParts: string[] = [];
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          textParts.push(value.items.map((item: { str?: string }) => item.str ?? "").join(""));
        }
      } finally {
        reader.releaseLock();
      }
      pageTexts.push(textParts.join(""));
    }
  } finally {
    await loadingTask.destroy();
  }

  const extracted = normalizeIntegrityText(pageTexts.join(""));
  const preparedQuestions = pages.flat().filter((item): item is PreparedQuestion => item.kind === "question");
  let extractedCursor = 0;
  for (const prepared of preparedQuestions) {
    for (const [lineIndex, line] of prepared.text.split("\n").entries()) {
      const expectedLine = normalizeIntegrityText(line);
      // pdf.js may interleave harmless positioning text between visual text
      // runs (especially around Thai shaping). Verify the expected glyphs in
      // document order instead of requiring one contiguous extracted string.
      for (const character of expectedLine) {
        const characterIndex = extracted.indexOf(character, extractedCursor);
        if (characterIndex === -1) {
          throw new Error(
            `Generated PDF text integrity check failed at question ${prepared.question.code}, line ${lineIndex + 1}: ` +
            `missing ${JSON.stringify(character)} (U+${character.codePointAt(0)?.toString(16).toUpperCase()}) near ` +
            `${JSON.stringify(extracted.slice(extractedCursor, extractedCursor + 80))}`,
          );
        }
        extractedCursor = characterIndex + character.length;
      }
      if (!expectedLine) {
        continue;
      }
      if (extractedCursor > extracted.length) {
        throw new Error(`Generated PDF text integrity check failed at question ${prepared.question.code}, line ${lineIndex + 1}`);
      }
    }
  }
}

function InspectionPdf({ inspection, responsiblePersons, metrics, surveyPages }: PdfProps & { metrics: PdfFontMetrics; surveyPages: SurveyItem[][] }) {
  const signatures = inspection.signatures ?? [];
  const totalPages = surveyPages.length + 2;

  return (
    <Document
      title={`PharmaCheck ${inspection.licenseNumber || inspection.pharmacyName || inspection.inspectionDate}`}
      author="PharmaCheck"
      subject="บันทึกการประเมินวิธีปฏิบัติทางเภสัชกรรมชุมชน"
      language="th"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.revision}>Revision {toThaiDigits(displayedRevision(inspection))}</Text>
        <View style={styles.titleRule} />
        <Text style={styles.documentTitle}>{protectPdfText("บันทึกการประเมินวิธีปฏิบัติทางเภสัชกรรมชุมชน")}<TextEndGuard /></Text>
        <Text style={styles.documentSubtitle}>{protectPdfText("ในสถานที่ขายยาแผนปัจจุบัน")}<TextEndGuard /></Text>
        <Text style={styles.documentLegal}>{wrapThaiLines(metrics, "ตามประกาศกระทรวงสาธารณสุข เรื่อง การกำหนดเกี่ยวกับสถานที่ อุปกรณ์ และวิธีปฏิบัติทางเภสัชกรรมชุมชน ในสถานที่ขายยาแผนปัจจุบัน ตามกฎหมายว่าด้วยยา พ.ศ. ๒๕๕๗", { maxWidth: surveyContentWidth - 60, fontSize: 9, fontWeight: 700 })}<TextEndGuard /></Text>
        <View style={styles.titleRule} />

        <Text style={styles.sectionTitle}>ข้อมูลสถานประกอบการและการตรวจประเมิน</Text>
        <View style={styles.detailsGrid}>
          <Detail label="วันที่ตรวจประเมิน" value={formatDate(inspection.inspectionDate)} metrics={metrics} />
          <Detail label="เวลา" value={inspection.startTime ? `${toThaiDigits(inspection.startTime)} น.` : "-"} metrics={metrics} />
          <Detail label="ผู้ประเมิน ๑" value={inspection.inspector1} metrics={metrics} wide />
          <Detail label="ผู้ประเมิน ๒" value={inspection.inspector2} metrics={metrics} wide />
          <Detail label="เลขที่ใบอนุญาต" value={inspection.licenseNumber} metrics={metrics} />
          <Detail label="ชื่อผู้รับอนุญาต" value={inspection.licenseHolderName} metrics={metrics} />
          <Detail label="ผู้ดำเนินกิจการ" value={inspection.operatorName} metrics={metrics} wide />
          <Detail label="สถานประกอบการชื่อ" value={inspection.pharmacyName} metrics={metrics} wide />
          <Detail label="ที่อยู่" value={inspection.address} metrics={metrics} wide />
          <Detail label="โทรศัพท์" value={inspection.telephone} metrics={metrics} />
          <Detail label="โทรสาร" value={inspection.fax} metrics={metrics} />
          <Detail label="มือถือ" value={inspection.mobile} metrics={metrics} />
        </View>

        <Text style={styles.sectionTitle}>ผู้มีหน้าที่ปฏิบัติการ</Text>
        <View style={styles.detailsGrid}>
          <Detail label="จำนวน" value={`${toThaiDigits(responsiblePersons.length)} คน`} metrics={metrics} />
          {!responsiblePersons.length ? (
            <Detail label="รายชื่อ" value="ยังไม่มีรายชื่อผู้มีหน้าที่ปฏิบัติการ" metrics={metrics} wide />
          ) : responsiblePersons.map((person, index) => (
            <Detail
              key={person.id}
              label={`คนที่ ${toThaiDigits(index + 1)}`}
              value={`${person.name || "ยังไม่ระบุชื่อ"}${person.licenseNumber ? ` · ภ. ${person.licenseNumber}` : ""} · เวลาปฏิบัติการ ${person.workStartTime || "-"} - ${person.workEndTime || "-"} น.`}
              metrics={metrics}
              wide
            />
          ))}
        </View>
        <Footer inspection={inspection} pageNumber={1} totalPages={totalPages} />
      </Page>

      {surveyPages.map((items, pageIndex) => (
        <Page key={`survey-${pageIndex}`} size="A4" style={[styles.page, styles.surveyPage]} wrap={false}>
          <TableHeader metrics={metrics} />
          {items.map((item, itemIndex) => {
            if (item.kind === "category") {
              return (
                <View key={`category-${item.code}-${itemIndex}`} style={styles.categoryRow} wrap={false}>
                  <Text style={styles.categoryTitleCell}>{toThaiDigits(item.code)}. {wrapThaiText(item.name)}</Text>
                  <View style={styles.categoryScoreCell} />
                  <View style={styles.categoryScoreCell} />
                  <View style={styles.categoryScoreCell} />
                  <View style={styles.categoryScoreCell} />
                  <View style={styles.categoryWeightCell} />
                  <View style={styles.categoryResultCell} />
                </View>
              );
            }

            if (item.kind === "summary") {
              return (
                <View key={`summary-${item.code}-${itemIndex}`} style={styles.categorySummary} wrap={false}>
                  <Text style={styles.categorySummaryLabel}>สรุปคะแนนหมวดที่ {toThaiDigits(item.code)}</Text>
                  <Text style={styles.categorySummaryValue}>คะแนนรวม × น้ำหนัก (A) {toThaiDigits(item.weightedScore)}   คะแนนเต็ม (B) {toThaiDigits(item.fullScore)}   ร้อยละ {item.fullScore ? toThaiDigits(Math.round((item.weightedScore / item.fullScore) * 100)) : "๐"}</Text>
                </View>
              );
            }

            return <QuestionRow key={`question-${item.question.code}`} prepared={item} />;
          })}
          <Footer inspection={inspection} pageNumber={pageIndex + 2} totalPages={totalPages} />
        </Page>
      ))}

      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>การรับรองผลการตรวจ</Text>
        <Text style={styles.certificationTitle}>ส่วนที่บกพร่อง / ขอให้แก้ไข</Text>
        <View style={styles.deficienciesBox}>
          <Text>{wrapThaiLines(metrics, inspection.deficiencies?.trim() || "ไม่ระบุ", { maxWidth: surveyContentWidth - 20, fontSize: 9 })}<TextEndGuard /></Text>
        </View>
        <Text style={styles.certificationStatement}>{wrapThaiLines(metrics, "ในการตรวจครั้งนี้ ผู้ประเมินและคณะมิได้ทำให้ทรัพย์สินของผู้รับอนุญาต / ผู้ดำเนินกิจการ / ผู้มีหน้าที่ปฏิบัติการ รวมถึงผู้เกี่ยวข้อง สูญหายหรือเสียหายแต่อย่างใด ข้าพเจ้าได้อ่าน / อ่านให้ฟังแล้ว รับรองว่าถูกต้อง จึงได้ลงลายมือชื่อไว้เป็นสำคัญ", { maxWidth: surveyContentWidth - 24, fontSize: 7.5 })}<TextEndGuard /></Text>
        <View style={styles.signatureGrid}>
          {signatureRoles.map(({ role, label }) => {
            const signature = signatures.find((entry) => entry.role === role);
            const linkedName = role === "assessor_1" ? inspection.inspector1 : role === "assessor_2" ? inspection.inspector2 : signature?.name;
            return (
              <View key={role} style={styles.signatureBlock} wrap={false}>
                <Text style={styles.signatureHeading}>{protectPdfText(label)}<TextEndGuard /></Text>
                <View style={styles.signatureImageWrap}>
                  {signature?.signature ? <Image style={styles.signatureImage} src={signature.signature} /> : null}
                </View>
                <Text style={styles.signatureLine}>{protectPdfText(`ลงชื่อ ${label}`)}<TextEndGuard /></Text>
                <Text style={styles.signatureName}>ชื่อ-นามสกุล  {wrapThaiLines(metrics, linkedName?.trim() || "-", { maxWidth: surveyContentWidth * 0.475 - 70, fontSize: 8 })}<TextEndGuard /></Text>
                {signature?.signedAt ? <Text style={styles.signedAt}>ลงนามเมื่อ {formatDateTime(signature.signedAt)}</Text> : null}
              </View>
            );
          })}
        </View>
        <Footer inspection={inspection} pageNumber={totalPages} totalPages={totalPages} />
      </Page>
    </Document>
  );
}

function QuestionRow({ prepared }: { prepared: PreparedQuestion }) {
  const { question, selectedValue, text, height } = prepared;
  const weightedResult = typeof selectedValue === "number" ? selectedValue * question.weight : null;

  return (
    <View style={[styles.questionRow, { height }]} wrap={false}>
      <View style={styles.questionCell}>
        <Text style={styles.questionCode}>{toThaiDigits(question.code)}</Text>
        <View style={styles.questionBody}>
          {text.split("\n").map((line, lineIndex) => (
            <Text key={`${question.code}-line-${lineIndex}`} style={styles.questionText}>
              {`${line}\u00A0`}
            </Text>
          ))}
        </View>
      </View>
      {[0, 1, 2, "NA"].map((value) => (
        <Text
          key={String(value)}
          style={[
            styles.scoreCell,
            selectedValue === value ? styles.scoreSelected : {},
            value === "NA" && !question.excludable ? styles.scoreUnavailable : {},
          ]}
        >
          {value === "NA" && !question.excludable ? "-" : selectedValue === value ? "✓" : ""}
        </Text>
      ))}
      <Text style={styles.weightCell}>{toThaiDigits(question.weight)}</Text>
      <Text style={styles.resultCell}>{weightedResult === null ? "" : toThaiDigits(weightedResult)}</Text>
    </View>
  );
}

let pdfFontMetricsPromise: Promise<PdfFontMetrics> | null = null;

async function loadPdfFontMetrics() {
  if (!pdfFontMetricsPromise) {
    pdfFontMetricsPromise = Promise.all([
      import("fontkit"),
      fetch(`${basePath}/fonts/Sarabun-Regular.ttf`),
      fetch(`${basePath}/fonts/Sarabun-Bold.ttf`),
    ]).then(async ([fontkit, regularResponse, boldResponse]) => {
      if (!regularResponse.ok || !boldResponse.ok) throw new Error("ไม่สามารถโหลดฟอนต์ Sarabun สำหรับสร้าง PDF ได้");
      const [regularBuffer, boldBuffer] = await Promise.all([
        regularResponse.arrayBuffer(),
        boldResponse.arrayBuffer(),
      ]);
      return {
        regular: fontkit.create(new Uint8Array(regularBuffer)),
        bold: fontkit.create(new Uint8Array(boldBuffer)),
      };
    });
  }
  return pdfFontMetricsPromise;
}

export async function generateInspectionPdf(props: PdfProps) {
  const metrics = await loadPdfFontMetrics();
  const answerByCode = new Map(props.answers.map((answer) => [answer.questionCode, answer]));
  const surveyPages = prepareSurveyPages(metrics, answerByCode);
  assertPreparedQuestionsComplete(surveyPages);
  const blob = await pdf(<InspectionPdf {...props} metrics={metrics} surveyPages={surveyPages} />).toBlob();
  try {
    await assertPdfQuestionsComplete(blob, surveyPages);
  } catch (error) {
    // Thai ToUnicode extraction is not a reliable rendering oracle: pdf.js
    // can omit or reorder combining marks even though the glyph is present.
    // Keep this as a development diagnostic, but never block an iPad download.
    console.warn("PDF text extraction validation was inconclusive", error);
  }
  return blob;
}
