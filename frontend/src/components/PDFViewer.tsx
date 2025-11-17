import { useEffect, useMemo, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  PDFDocumentProxy,
  PDFPageProxy
} from "pdfjs-dist";
import { MatchedElement } from "../types";
import worker from "pdfjs-dist/build/pdf.worker?url";

GlobalWorkerOptions.workerSrc = worker;

interface PDFViewerProps {
  file: File | null;
  matchedElements: MatchedElement[];
  highlightedElementId: string | null;
  onHighlightChange: (elementId: string, pageNumber: number) => void;
  pageInfoMap: Map<number, { width_px?: number; height_px?: number }>;
  sortedMatches: MatchedElement[];
  currentIndex: number;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
}

const PDFViewer = ({
  file,
  matchedElements,
  highlightedElementId,
  onHighlightChange,
  pageInfoMap,
  sortedMatches,
  currentIndex,
  onNavigatePrev,
  onNavigateNext
}: PDFViewerProps) => {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<any>(null);
  const [currentPageObj, setCurrentPageObj] = useState<PDFPageProxy | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!file) {
      setDoc(null);
      return;
    }
    const url = URL.createObjectURL(file);
    getDocument(url)
      .promise.then((pdf: PDFDocumentProxy) => {
        setDoc(pdf);
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
      })
      .catch((error) => console.error(error));

    return () => {
      URL.revokeObjectURL(url);
      setDoc(null);
    };
  }, [file]);

  useEffect(() => {
    if (!doc) return;

    const renderPage = async () => {
      const page = await doc.getPage(currentPage);
      setCurrentPageObj(page);
      
      // Render at scale 1.5 (must match the scale used for transformation)
      const viewportObj = page.getViewport({ scale: 1.5 });
      setViewport(viewportObj);
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      canvas.height = viewportObj.height;
      canvas.width = viewportObj.width;
      await page.render({ canvasContext: context!, viewport: viewportObj }).promise;
      setCanvasSize({ width: viewportObj.width, height: viewportObj.height });
    };

    renderPage();
  }, [doc, currentPage]);

  const matchesByPage = useMemo(() => {
    const map = new Map<number, MatchedElement[]>();
    matchedElements.forEach((element) => {
      if (!map.has(element.page_number)) {
        map.set(element.page_number, []);
      }
      map.get(element.page_number)!.push(element);
    });
    return map;
  }, [matchedElements]);

  useEffect(() => {
    if (!matchedElements.length) return;
    const match = matchedElements.find(
      (el) => el.element_id === highlightedElementId
    );
    if (match) {
      setCurrentPage(match.page_number);
    }
  }, [highlightedElementId, matchedElements]);

  if (!file) {
    return (
      <div className="card">
        Upload a PDF during this session to enable PDF preview & overlays.
      </div>
    );
  }

  const pageMatches = matchesByPage.get(currentPage) ?? [];

  return (
    <div className="pdf-viewer">
      <div className="section-title">
        <div>
          <h3>PDF Preview</h3>
          <p>Bounding boxes are drawn for the current page.</p>
        </div>
        <div>
          <select
            value={currentPage}
            onChange={(event) => setCurrentPage(Number(event.target.value))}
          >
            {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(
              (page) => (
                <option key={page} value={page}>
                  Page {page}
                </option>
              )
            )}
          </select>
        </div>
      </div>

      <div className="pdf-canvas-wrapper" style={{ position: "relative" }}>
        <canvas ref={canvasRef} />
        {sortedMatches.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              background: "rgba(255, 255, 255, 0.95)",
              padding: "0.5rem",
              borderRadius: "4px",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              zIndex: 10
            }}
          >
            <span style={{ fontSize: "0.875rem", color: "#64748b" }}>
              {currentIndex >= 0
                ? `${currentIndex + 1} / ${sortedMatches.length}`
                : `0 / ${sortedMatches.length}`}
            </span>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onNavigatePrev}
              disabled={sortedMatches.length === 0}
              style={{ padding: "0.25rem 0.5rem", fontSize: "0.875rem" }}
            >
              ← Prev
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onNavigateNext}
              disabled={sortedMatches.length === 0}
              style={{ padding: "0.25rem 0.5rem", fontSize: "0.875rem" }}
            >
              Next →
            </button>
          </div>
        )}
        {pageMatches.map((element) => {
          if (!viewport || !currentPageObj) return null;
          
          // Prefer bbox_pdf if available (more accurate with PDF.js viewport)
          // Otherwise fall back to bbox_pixel
          let coords: { left: number; top: number; width: number; height: number } | null = null;
          
          if (element.bbox_pdf && element.bbox_pdf.length === 4) {
            // Use bbox_pdf with proper viewport transformation
            // Get base viewport for PDF dimensions
            const baseViewport = currentPageObj.getViewport({ scale: 1.0 });
            const pdfHeightPoints = baseViewport.height * (72 / 96);
            const scale = viewport.scale || 1.5;
            const [x0_pdf, y0_pdf, x1_pdf, y1_pdf] = element.bbox_pdf;
            
            // Transform coordinates
            const left = x0_pdf * (96 / 72) * scale;
            const right = x1_pdf * (96 / 72) * scale;
            const top = (pdfHeightPoints - y1_pdf) * (96 / 72) * scale;
            const bottom = (pdfHeightPoints - y0_pdf) * (96 / 72) * scale;
            
            coords = {
              left,
              top,
              width: right - left,
              height: bottom - top
            };
          } else if (element.bbox_pixel && element.bbox_pixel.length === 4) {
            // Fall back to bbox_pixel: scale from rasterized image to viewport
            const [x0, y0, x1, y1] = element.bbox_pixel;
            const pageInfo = pageInfoMap.get(currentPage);
            
            if (!pageInfo?.width_px || !pageInfo?.height_px) return null;
            
            // Scale from rasterized image dimensions to viewport dimensions
            const scaleX = viewport.width / pageInfo.width_px;
            const scaleY = viewport.height / pageInfo.height_px;
            
            coords = {
              left: x0 * scaleX,
              top: y0 * scaleY,
              width: (x1 - x0) * scaleX,
              height: (y1 - y0) * scaleY
            };
          } else {
            return null;
          }
          
          if (!coords) return null;
          
          const style = {
            position: "absolute" as const,
            left: `${coords.left}px`,
            top: `${coords.top}px`,
            width: `${coords.width}px`,
            height: `${coords.height}px`,
            pointerEvents: "auto" as const
          };
          
          const highlight = highlightedElementId === element.element_id;
          return (
            <div
              key={element.element_id}
              className={`bbox ${highlight ? "bbox--highlighted" : ""}`}
              style={style}
              onClick={() => {
                // Toggle: if already highlighted, clear it; otherwise set it
                if (highlight) {
                  onHighlightChange("", element.page_number); // Clear highlight
                } else {
                  onHighlightChange(element.element_id, element.page_number);
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export default PDFViewer;

