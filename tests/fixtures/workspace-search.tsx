import { createRoot } from "react-dom/client";
import { extractWorkspaceText } from "../../src/lib/extractWorkspaceText";
import PdfSearchPreview from "../../src/components/PdfSearchPreview";
import SearchHighlight from "../../src/components/SearchHighlight";
import "../../src/index.css";

// A real one-page PDF fixture with predictable text; no live project or uploads.
const stream = "BT /F1 20 Tf 30 150 Td (Workspace Search Test) Tj ET";
const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
let pdf="%PDF-1.4\n"; const offsets=[0];
objects.forEach((value,i)=>{ offsets.push(pdf.length); pdf+=`${i+1} 0 obj\n${value}\nendobj\n`; });
const xref=pdf.length;
pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,"0")+" 00000 n ").join("\n")}\ntrailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
const file=new File([pdf],"search.pdf",{type:"application/pdf"});
const result=await extractWorkspaceText(file);
const text=await extractWorkspaceText(new File(["한글 검색 본문"],"test.txt"));
const binary=await extractWorkspaceText(new File(["test"],"test.pptx"));
const partial=await extractWorkspaceText(new File(["a".repeat(210000)],"large.txt"));
const pass=result.status==="ready" && result.text.includes("Workspace Search Test") && text.text==="한글 검색 본문" && binary.status==="unsupported" && partial.status==="partial" && partial.text.length===200000;
createRoot(document.getElementById("root")!).render(<main style={{width:500,margin:24}}><h1>{pass?"PASS: PDF, Korean text, unsupported format and truncation":"FAIL"}</h1><p><SearchHighlight text={result.text} query="Search" /></p><PdfSearchPreview source={URL.createObjectURL(file)} query="Search" /></main>);
