import PDFDocument from "pdfkit";
import { Material, Message, Quiz } from "@prisma/client";

interface GlossaryTerm {
    term: string;
    definition: string;
    category?: string;
}

interface Flashcard {
    front: string;
    back: string;
}

interface ReportData {
    material: Material;
    messages: Message[];
    summary: string | null;
    quizzes: Quiz[];
    glossary: GlossaryTerm[];
    flashcards: Flashcard[];
}

export const generateLearningReport = (data: ReportData): PDFKit.PDFDocument => {
    const doc = new PDFDocument({ margin: 50 });

    // HEADER
    doc.fontSize(24).font('Helvetica-Bold').text("Learning Report", { align: 'center' });
    doc.moveDown();

    doc.fontSize(16).text(data.material.title, { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(2);

    // SUMMARY SECTION
    if (data.summary || data.material.summary) {
        doc.fontSize(14).font('Helvetica-Bold').text("Summary");
        doc.moveDown(0.5);
        doc.fontSize(11).font('Helvetica').text(data.summary || data.material.summary || "");
        doc.moveDown(2);
    }

    // GLOSSARY SECTION
    if (data.glossary && data.glossary.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').text("Glossary & Key Terms");
        doc.moveDown(0.5);

        data.glossary.forEach(term => {
            doc.font('Helvetica-Bold').text(term.term, { continued: true });
            doc.font('Helvetica').text(`: ${term.definition}`);
            doc.moveDown(0.5);
        });
        doc.moveDown(2);
    }

    // FLASHCARDS SECTION
    if (data.flashcards && data.flashcards.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').text("Flashcards");
        doc.moveDown(0.5);

        data.flashcards.forEach((card, i) => {
            doc.fontSize(11).font('Helvetica-Bold').text(`Q: ${card.front}`);
            doc.font('Helvetica').text(`A: ${card.back}`);
            doc.moveDown(0.5);
        });
        doc.moveDown(2);
    }

    // KEY INSIGHTS FROM CHAT
    if (data.messages && data.messages.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').text("Key Discussions");
        doc.moveDown(0.5);

        data.messages.forEach(msg => {
            const role = msg.role === 'user' ? 'You' : 'AI Assistant';
            const color = msg.role === 'user' ? '#555555' : '#000000';

            doc.fillColor(color).font('Helvetica-Bold').text(role);
            doc.fillColor('black').font('Helvetica').text(msg.content);
            doc.moveDown(0.5);
        });
        doc.moveDown(2);
    }

    // QUIZ RESULTS / QUESTIONS
    if (data.quizzes && data.quizzes.length > 0) {
        doc.addPage();
        doc.fontSize(14).font('Helvetica-Bold').text("Practice Questions");
        doc.moveDown(0.5);

        data.quizzes.forEach((quiz, index) => {
            doc.fontSize(11).font('Helvetica-Bold').text(`${index + 1}. ${quiz.question}`);
            doc.moveDown(0.2);

            // Options
            try {
                // Handle options if it's string (JSON) or array
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const options = typeof quiz.options === 'string' ? JSON.parse(quiz.options) : (quiz.options as any);

                if (Array.isArray(options)) {
                    options.forEach((opt: string, idx: number) => {
                        const isCorrect = idx === quiz.answer;
                        doc.font(isCorrect ? 'Helvetica-BoldOblique' : 'Helvetica').text(`   ${String.fromCharCode(97 + idx)}) ${opt}`);
                    });
                }
            } catch (e) {
                // Fallback if options parsing fails
            }

            if (quiz.hint) {
                doc.fillColor('grey').fontSize(10).font('Helvetica-Oblique').text(`   Hint: ${quiz.hint}`);
                doc.fillColor('black'); // Reset color
            }

            doc.moveDown(1);
        });
    }

    return doc;
};
