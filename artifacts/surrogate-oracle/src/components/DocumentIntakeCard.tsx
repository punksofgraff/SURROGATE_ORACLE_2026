import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileText, Image as ImageIcon, RefreshCw, Video, X } from 'lucide-react';
import { Packer, Document as DocxDocument, Paragraph, TextRun } from 'docx';
import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth';
import { ParticleTypographyCard } from './ParticleTypographyCard';
import type { ArchivedDocumentReadout } from '../lib/documentArchive';

export type DocumentIntakeFile = { file: File; requestId: number };

type Analysis = {
  name: string;
  kind: 'text' | 'pdf' | 'docx' | 'image' | 'video';
  text: string;
  detail: string;
  previewUrl?: string;
  duration?: number;
  dimensions?: string;
};

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPT = '.txt,.md,.csv,.json,.pdf,.docx,.png,.jpg,.jpeg,.webp,.gif,.mp4,.webm,.mov,.m4v';

function kindFor(file: File): Analysis['kind'] | null {
  const ext = file.name.toLowerCase().split('.').pop();
  if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext ?? '')) return 'image';
  if (file.type.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v'].includes(ext ?? '')) return 'video';
  if (file.type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (file.type.includes('wordprocessingml') || ext === 'docx') return 'docx';
  if (file.type.startsWith('text/') || ['txt', 'md', 'csv', 'json'].includes(ext ?? '')) return 'text';
  return null;
}

async function readPdf(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let pageNo = 1; pageNo <= Math.min(pdf.numPages, 30); pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: any) => ('str' in item ? item.str : '')).join(' '));
  }
  return pages.join('\n\n').trim();
}

async function analyzeFile(file: File, onProgress: (value: number) => void): Promise<Analysis> {
  if (file.size > MAX_BYTES) throw new Error('That signal is larger than 50 MB. Choose a smaller file.');
  const kind = kindFor(file);
  if (!kind) throw new Error('This file type is not supported. Use text, PDF, DOCX, image, or video.');
  const previewUrl = kind === 'image' || kind === 'video' ? URL.createObjectURL(file) : undefined;
  onProgress(15);
  if (kind === 'text') {
    const text = (await file.text()).slice(0, 120_000);
    onProgress(100);
    return { name: file.name, kind, text, detail: `${file.type || 'plain text'} · ${file.size.toLocaleString()} bytes`, previewUrl };
  }
  if (kind === 'pdf') {
    onProgress(35);
    const text = await readPdf(file);
    onProgress(100);
    return { name: file.name, kind, text: text || 'This PDF contains no selectable text. It may be an image-only document.', detail: `PDF · ${file.size.toLocaleString()} bytes`, previewUrl };
  }
  if (kind === 'docx') {
    onProgress(35);
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    onProgress(100);
    return { name: file.name, kind, text: result.value.slice(0, 120_000) || 'This DOCX contains no readable paragraphs.', detail: `DOCX · ${file.size.toLocaleString()} bytes`, previewUrl };
  }
  if (kind === 'image') {
    const dimensions = await new Promise<string>((resolve) => {
      const image = new Image();
      image.onload = () => resolve(`${image.naturalWidth} × ${image.naturalHeight}px`);
      image.onerror = () => resolve('dimensions unavailable');
      image.src = previewUrl!;
    });
    onProgress(100);
    return { name: file.name, kind, text: `Visual signal: ${file.name}`, detail: `${file.type || 'image'} · ${dimensions}`, previewUrl, dimensions };
  }
  const duration = await new Promise<number>((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => resolve(0);
    video.src = previewUrl!;
  });
  onProgress(100);
  return { name: file.name, kind, text: `Video signal: ${file.name}`, detail: `${file.type || 'video'} · ${duration ? `${duration.toFixed(1)} seconds` : 'duration unavailable'}`, previewUrl, duration };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DocumentIntakeCard({
  intake,
  archivedReadout,
  onClose,
  onSave,
}: {
  intake?: DocumentIntakeFile;
  archivedReadout?: ArchivedDocumentReadout;
  onClose: () => void;
  onSave?: (analysis: Omit<ArchivedDocumentReadout, 'id' | 'savedAt'>) => void;
}) {
  const [status, setStatus] = useState<'analyzing' | 'ready' | 'error'>(archivedReadout ? 'ready' : 'analyzing');
  const [progress, setProgress] = useState(5);
  const [analysis, setAnalysis] = useState<Analysis | null>(archivedReadout ?? null);
  const [error, setError] = useState('');
  const file = intake?.file;

  const runAnalysis = useCallback(() => {
    setStatus('analyzing');
    setProgress(5);
    setError('');
    if (!file) return;
    void analyzeFile(file, setProgress).then((result) => {
      setAnalysis(result);
      setStatus('ready');
    }).catch((reason: unknown) => {
      setStatus('error');
      setError(reason instanceof Error ? reason.message : 'The signal could not be analyzed.');
    });
  }, [file]);

  useEffect(() => {
    runAnalysis();
    return () => {
      if (analysis?.previewUrl) URL.revokeObjectURL(analysis.previewUrl);
    };
    // The selected file is immutable for this card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const exportText = () => {
    if (!analysis) return;
    downloadBlob(new Blob([analysis.text], { type: 'text/plain;charset=utf-8' }), `${analysis.name.replace(/\.[^.]+$/, '')}-oracle.txt`);
  };
  const exportPdf = () => {
    if (!analysis) return;
    const pdf = new jsPDF();
    const lines = pdf.splitTextToSize(`${analysis.name}\n\n${analysis.text || analysis.detail}`, 170);
    let y = 18;
    lines.forEach((line: string) => {
      if (y > 280) { pdf.addPage(); y = 18; }
      pdf.text(line, 20, y);
      y += 7;
    });
    pdf.save(`${analysis.name.replace(/\.[^.]+$/, '')}-oracle.pdf`);
  };
  const exportDocx = async () => {
    if (!analysis) return;
    const doc = new DocxDocument({ sections: [{ children: [
      new Paragraph({ children: [new TextRun({ text: analysis.name, bold: true, size: 28 })] }),
      new Paragraph({ text: analysis.text || analysis.detail }),
    ] }] });
    downloadBlob(await Packer.toBlob(doc), `${analysis.name.replace(/\.[^.]+$/, '')}-oracle.docx`);
  };

  const icon = useMemo(() => {
    if (analysis?.kind === 'image') return <ImageIcon size={18} />;
    if (analysis?.kind === 'video') return <Video size={18} />;
    return <FileText size={18} />;
  }, [analysis?.kind]);

  return (
    <article className="oracle-document-card" aria-live="polite">
      <div className="oracle-document-card__topline">
        <span className="oracle-document-card__eyebrow">{icon} ORACLE DOCUMENT VIEWER</span>
        <button type="button" className="oracle-document-card__close" onClick={onClose} aria-label="Close document viewer"><X size={16} /></button>
      </div>
      <div className="oracle-document-card__title">{analysis?.name ?? file?.name}</div>
      {status === 'analyzing' && (
        <div className="oracle-document-card__progress">
          <ParticleTypographyCard questionIndex={0} landedChars={Math.round('ANALYZING SIGNAL'.length * progress / 100)} isEmitting isSelected={false} isThisSelected={false} accentColor="#00ffcc" territory="DOCUMENT SIGNAL" question="ANALYZING SIGNAL" />
          <div className="oracle-document-card__bar"><span style={{ width: `${progress}%` }} /></div>
          <div>{progress}% · reading locally, original file stays on this device</div>
        </div>
      )}
      {status === 'error' && (
        <div className="oracle-document-card__error">
          <strong>SIGNAL FAILED</strong><span>{error}</span>
          <button type="button" className="oc-send-btn" onClick={runAnalysis}><RefreshCw size={14} /> RETRY</button>
        </div>
      )}
      {status === 'ready' && analysis && (
        <>
          {analysis.previewUrl && analysis.kind === 'image' && <img className="oracle-document-card__preview" src={analysis.previewUrl} alt={`Preview of ${analysis.name}`} />}
          {analysis.previewUrl && analysis.kind === 'video' && <video className="oracle-document-card__preview" src={analysis.previewUrl} controls playsInline />}
          <ParticleTypographyCard questionIndex={0} landedChars={'SIGNAL READ'.length} isSelected={false} isThisSelected={false} accentColor="#00ff88" territory="ORACLE READOUT" question="SIGNAL READ" />
          <p className="oracle-document-card__detail">{analysis.detail}</p>
          <div className="oracle-document-card__copy">{analysis.text}</div>
           {!archivedReadout && onSave && (
             <div className="oracle-document-card__save-note">
               Save only this readout to your private archive. The original file is never saved.
             </div>
           )}
          <div className="oracle-document-card__actions">
             {!archivedReadout && onSave && <button type="button" className="oc-send-btn oracle-document-card__save" onClick={() => onSave({
               name: analysis.name,
               kind: analysis.kind,
               text: analysis.text,
               detail: analysis.detail,
               dimensions: analysis.dimensions,
               duration: analysis.duration,
             })}>SAVE READOUT</button>}
            <button type="button" className="oc-send-btn" onClick={exportText}><Download size={14} /> TEXT</button>
            <button type="button" className="oc-send-btn" onClick={exportPdf}><Download size={14} /> PDF</button>
            <button type="button" className="oc-send-btn" onClick={() => void exportDocx()}><Download size={14} /> DOCX</button>
          </div>
        </>
      )}
    </article>
  );
}

export { ACCEPT as DOCUMENT_ACCEPT };