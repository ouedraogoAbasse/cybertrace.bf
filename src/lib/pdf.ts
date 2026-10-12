/**
 * Generation du rapport PDF d'un dossier (cahier des charges §2, §4, §10).
 *
 * Le rapport contient : les informations du dossier, la liste des preuves avec
 * leurs empreintes SHA-256, l'historique des operations de conservation et la
 * mention des limites de la methode.
 *
 * Le rendu est un flux : la memoire reste constante quelle que soit la taille
 * du rapport.
 */
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { Writable } from "node:stream";

const COLORS = {
  navy: "#0B1526",
  blue: "#2E86FF",
  gold: "#F2C14E",
  text: "#1F2937",
  gray: "#6B7280",
  lightGray: "#E5E7EB",
  red: "#B3261E",
  green: "#1B7F3B",
};

export type ReportVerification = {
  horodatage: Date;
  verdict: "IDENTIQUE" | "MODIFIE";
  empreinteRecalculee: string;
};

export type ReportEvidence = {
  nomOriginal: string;
  empreinteInitiale: string;
  taille: number;
  mimeType: string;
  description: string | null;
  provenanceDeclaree: string | null;
  dateCollecteDeclaree: Date | null;
  dateEnregistrement: Date;
  ajoutePar: string | null;
  verifications: ReportVerification[];
};

export type ReportSite = {
  url: string;
  hote: string;
  score: number;
  verdict: "SURE" | "SUSPECTE" | "FRAUDULEUSE";
  analyseLe: Date;
  indicateurs: string[];
};

export type ReportEvent = {
  horodatage: Date;
  acteur: string;
  action: string;
  resultatDetail: string;
};

export type CaseReportData = {
  reference: string;
  titre: string;
  description: string | null;
  categorie: string | null;
  statut: string;
  creePar: string;
  dateCreation: Date;
  evidence: ReportEvidence[];
  sites: ReportSite[];
  events: ReportEvent[];
  generationDate: Date;
  generateur: string;
};

const MARGIN = 48;
const SLOGAN = "La preuve numerique, preservee et tracable.";

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });
}

function fmtTaille(o: number): string {
  if (o < 1024) return `${o} o`;
  if (o < 1024 * 1024) return `${(o / 1024).toFixed(1)} Ko`;
  return `${(o / (1024 * 1024)).toFixed(2)} Mo`;
}

export function renderCaseReport(out: Writable, data: CaseReportData): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      bufferPages: true,
      info: {
        Title: `Rapport d'enquete ${data.reference} — CyberTrace BF`,
        Author: "CyberTrace BF",
        Creator: "CyberTrace BF — generateur de rapports",
      },
    });

    doc.on("error", reject);
    doc.on("end", resolve);
    doc.pipe(out);

    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - MARGIN * 2;
    let y = 0;

    const drawHeader = (continuation = false) => {
      doc.rect(0, 0, pageWidth, continuation ? 56 : 96).fill(COLORS.navy);
      const logoPath = path.join(process.cwd(), "public", "logo.jpeg");
      let textX = MARGIN;
      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, MARGIN, continuation ? 12 : 24, { height: continuation ? 32 : 48 });
          textX = MARGIN + (continuation ? 44 : 66);
        } catch {
          /* logo invalide : on continue sans lui */
        }
      }
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(continuation ? 12 : 18);
      doc.text(`CyberTrace BF — ${data.reference}`, textX, continuation ? 20 : 26);
      if (!continuation) {
        doc.font("Helvetica").fontSize(10).fillColor(COLORS.gold);
        doc.text(SLOGAN, textX, 50);
        doc.font("Helvetica-Bold").fontSize(13).fillColor("#FFFFFF");
        doc.text(data.titre, MARGIN, 68);
      }
      doc.rect(0, continuation ? 56 : 96, pageWidth, 3).fill(COLORS.blue);
      y = (continuation ? 56 : 96) + 20;
    };

    const ensureSpace = (needed: number) => {
      if (y + needed > doc.page.height - 70) {
        doc.addPage();
        drawHeader(true);
      }
    };

    const sectionTitle = (title: string) => {
      ensureSpace(30);
      doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.navy);
      doc.text(title, MARGIN, y);
      y += 16;
      doc.moveTo(MARGIN, y).lineTo(pageWidth - MARGIN, y).lineWidth(1).stroke(COLORS.lightGray);
      y += 10;
    };

    const keyValue = (label: string, value: string, mono = false) => {
      ensureSpace(18);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.gray);
      doc.text(label, MARGIN, y, { width: 150 });
      doc.font(mono ? "Courier" : "Helvetica").fontSize(9).fillColor(COLORS.text);
      doc.text(value, MARGIN + 155, y, { width: contentWidth - 155 });
      y = Math.max(y + 14, doc.y + 2);
    };

    drawHeader(false);

    // --- 1. Dossier -------------------------------------------------------
    sectionTitle("1. Informations du dossier");
    keyValue("Reference", data.reference);
    keyValue("Titre", data.titre);
    if (data.description) keyValue("Description", data.description);
    if (data.categorie) keyValue("Categorie", data.categorie);
    keyValue("Statut", data.statut);
    keyValue("Cree par", data.creePar);
    keyValue("Date de creation", fmtDate(data.dateCreation));

    // --- 2. Preuves --------------------------------------------------------
    y += 8;
    sectionTitle(`2. Preuves numeriques (${data.evidence.length})`);

    if (data.evidence.length === 0) {
      doc.font("Helvetica-Oblique").fontSize(9).fillColor(COLORS.gray);
      doc.text("Aucune preuve enregistree dans ce dossier.", MARGIN, y);
      y += 16;
    }

    data.evidence.forEach((ev, i) => {
      ensureSpace(90);
      doc.roundedRect(MARGIN, y, contentWidth, 6, 3).fill(COLORS.blue);
      y += 12;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.navy);
      doc.text(`Preuve ${i + 1} — ${ev.nomOriginal}`, MARGIN, y);
      y = doc.y + 4;
      keyValue("Empreinte SHA-256", ev.empreinteInitiale, true);
      keyValue("Taille", fmtTaille(ev.taille));
      keyValue("Type MIME", ev.mimeType);
      if (ev.description) keyValue("Description", ev.description);
      if (ev.provenanceDeclaree) keyValue("Provenance declaree", ev.provenanceDeclaree);
      keyValue("Collecte declaree", fmtDate(ev.dateCollecteDeclaree));
      keyValue("Enregistre le", `${fmtDate(ev.dateEnregistrement)} (serveur)`);
      if (ev.ajoutePar) keyValue("Ajoute par", ev.ajoutePar);

      ev.verifications.forEach((v) => {
        ensureSpace(16);
        doc.font("Helvetica").fontSize(9);
        const label = v.verdict === "IDENTIQUE" ? COLORS.green : COLORS.red;
        doc.fillColor(label).text(`Verdict : ${v.verdict}`, MARGIN + 12, y);
        doc.fillColor(COLORS.gray).text(
          ` recalcul ${fmtDate(v.horodatage)} — ${v.empreinteRecalculee}`,
          MARGIN + 130,
          y,
          { width: contentWidth - 130 },
        );
        y = Math.max(doc.y + 4, y + 14);
      });
      y += 6;
    });

    // --- 3. Sites frauduleux analyses ---------------------------------------
    y += 8;
    sectionTitle(`3. Sites frauduleux analyses (${data.sites.length})`);

    if (data.sites.length === 0) {
      doc.font("Helvetica-Oblique").fontSize(9).fillColor(COLORS.gray);
      doc.text("Aucune analyse de site frauduleux dans ce dossier.", MARGIN, y);
      y += 16;
    } else {
      data.sites.forEach((site) => {
        ensureSpace(42);
        const couleur =
          site.verdict === "FRAUDULEUSE" ? COLORS.red : site.verdict === "SUSPECTE" ? "#B7791F" : COLORS.green;
        doc.font("Helvetica-Bold").fontSize(10).fillColor(couleur);
        doc.text(`${site.verdict} — risque ${site.score}/100`, MARGIN, y);
        doc.font("Helvetica").fontSize(9).fillColor(COLORS.text);
        doc.text(site.url.slice(0, 110), MARGIN + 140, y, { width: contentWidth - 140 });
        y = doc.y + 4;
        doc.font("Helvetica").fontSize(8).fillColor(COLORS.gray);
        doc.text(`Analyse le ${fmtDate(site.analyseLe)}`, MARGIN + 12, y);
        y = doc.y + 3;
        if (site.indicateurs.length > 0) {
          doc.font("Helvetica").fontSize(8).fillColor(COLORS.text);
          doc.text(`Indicateurs : ${site.indicateurs.slice(0, 5).join(" ; ")}`, MARGIN + 12, y, {
            width: contentWidth - 12,
          });
          y = doc.y + 4;
        }
      });
    }

    // --- 4. Historique ------------------------------------------------------
    y += 8;
    sectionTitle(`4. Historique des operations (${data.events.length})`);

    if (data.events.length === 0) {
      doc.font("Helvetica-Oblique").fontSize(9).fillColor(COLORS.gray);
      doc.text("Aucun evenement trace.", MARGIN, y);
      y += 16;
    } else {
      const cols = [
        { title: "Horodatage", w: 110 },
        { title: "Acteur", w: 90 },
        { title: "Action", w: 110 },
        { title: "Detail", w: contentWidth - 310 },
      ];
      const drawRow = (cells: string[], header = false) => {
        ensureSpace(16);
        let x = MARGIN;
        doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(8);
        cells.forEach((c, ci) => {
          doc.fillColor(header ? "#FFFFFF" : COLORS.text).text(c, x + 3, y + 3, {
            width: cols[ci].w - 6,
            height: 10,
            ellipsis: true,
            lineBreak: false,
          });
          x += cols[ci].w;
        });
        if (header) {
          doc.rect(MARGIN, y, contentWidth, 16).fill(COLORS.navy);
          let x2 = MARGIN;
          doc.font("Helvetica-Bold").fontSize(8).fillColor("#FFFFFF");
          cells.forEach((c, ci) => {
            doc.text(c, x2 + 3, y + 3, { width: cols[ci].w - 6, lineBreak: false });
            x2 += cols[ci].w;
          });
        }
        y += 16;
      };
      drawRow(cols.map((c) => c.title), true);
      data.events.forEach((e) => {
        drawRow([fmtDate(e.horodatage), e.acteur, e.action, `${e.resultatDetail}`]);
        doc.rect(MARGIN, y - 16, contentWidth, 16).stroke(COLORS.lightGray);
      });
    }

    // --- 4. Limites ---------------------------------------------------------
    y += 10;
    ensureSpace(70);
    doc.roundedRect(MARGIN, y, contentWidth, 58, 4).fill("#FFF8E1");
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.navy);
    doc.text("Mention importante sur la valeur de la preuve", MARGIN + 10, y + 8);
    doc.font("Helvetica").fontSize(8).fillColor(COLORS.text);
    doc.text(
      "L'empreinte SHA-256 permet de comparer le contenu d'un fichier a sa valeur de reference " +
        "et de detecter toute modification depuis son enregistrement. Elle ne prouve pas a elle seule " +
        "l'authenticite de l'origine, la date reelle de collecte ni la valeur juridique d'une preuve. " +
        "Les dates de collecte indiquees sont des donnees declarees par le deposant.",
      MARGIN + 10,
      y + 22,
      { width: contentWidth - 20, align: "justify" },
    );

    // --- Pieds de page ------------------------------------------------------
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(7).fillColor(COLORS.gray);
      doc.text(
        `CyberTrace BF — document genere par ${data.generateur} le ${fmtDate(data.generationDate)} — donnees de demonstration`,
        MARGIN,
        doc.page.height - 40,
        { width: contentWidth, align: "center" },
      );
      doc.text(`Page ${i - range.start + 1} / ${range.count}`, MARGIN, doc.page.height - 30, {
        width: contentWidth,
        align: "center",
      });
    }

    doc.end();
  });
}
