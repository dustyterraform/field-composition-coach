import { useState, useRef, useCallback, useEffect } from "react";

const MARKUP_COLORS = {
  leadingLine:   { stroke: "#FFE500", label: "Leading Line" },
  focalPoint:    { stroke: "#00FF85", label: "Focal Point" },
  distraction:   { stroke: "#FF2D55", label: "Distraction" },
  suggestedCrop: { stroke: "#FF00FF", label: "Suggested Crop" },
};

const SYSTEM_PROMPT = `You are an expert landscape photography coach helping beginners and intermediate photographers improve their in-field composition skills. You only suggest in-camera changes — never post-processing edits.

When critiquing a landscape photo, respond ONLY with a valid JSON object. All coordinates are normalized 0.0–1.0 relative to the image width and height (0,0 = top-left corner).

{
  "markup": [
    {
      "type": "leadingLine",
      "x1": 0.15, "y1": 0.95,
      "x2": 0.55, "y2": 0.35,
      "label": "River draws eye to mountains"
    },
    {
      "type": "focalPoint",
      "x": 0.38, "y": 0.18, "width": 0.24, "height": 0.18,
      "label": "Primary subject: mountain peak"
    },
    {
      "type": "distraction",
      "x": 0.04, "y": 0.03, "width": 0.12, "height": 0.09,
      "label": "Blown sky highlight"
    },
    {
      "type": "suggestedCrop",
      "x": 0.06, "y": 0.08, "width": 0.88, "height": 0.78,
      "label": "Tighter crop removes dead space"
    }
  ],
  "title": "A descriptive name for the photo based on what you see",
  "overallGrade": "B+",
  "positiveSummary": "2-3 sentences celebrating what works well.",
  "sections": [
    {
      "name": "Subject and Focal Point",
      "grade": "A-",
      "analysis": "2-4 sentences analyzing subject clarity and focal point strength.",
      "improvements": "1-3 specific in-camera suggestions. Never suggest post-processing."
    },
    {
      "name": "Leading Lines and Paths",
      "grade": "B",
      "analysis": "2-4 sentences analyzing linear elements guiding the viewer's eye.",
      "improvements": "1-3 specific in-camera suggestions. Never suggest post-processing."
    },
    {
      "name": "Balance and Framing",
      "grade": "B+",
      "analysis": "2-4 sentences analyzing composition balance, rule of thirds, horizon, layering.",
      "improvements": "1-3 specific in-camera suggestions. Never suggest post-processing."
    },
    {
      "name": "Mood and Emotion",
      "grade": "A",
      "analysis": "2-4 sentences analyzing light quality, atmosphere, scale, and emotional impact.",
      "improvements": "1-3 specific in-camera suggestions. Never suggest post-processing."
    }
  ],
  "actionableSummary": {
    "headline": "What to do right now before you shoot",
    "actions": [
      "Specific in-camera action #1",
      "Specific in-camera action #2",
      "Specific in-camera action #3"
    ]
  }
}

Include 1-3 leading lines if present, exactly 1 focal point, 0-3 distractions, and 0-1 suggested crop.
Grades use: A+, A, A-, B+, B, B-, C+, C, C-, D, F
Keep tone encouraging and educational. Never mention Lightroom, Photoshop, or any editing software.`;

// ─── Canvas drawing helpers ───────────────────────────────────────────────────

function drawArrow(ctx, x1, y1, x2, y2, color) {
  const headLen = 14;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawNumberBadge(ctx, num, x, y, color) {
  const r = 11;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.82)";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(num), x, y);
  ctx.restore();
}

function renderMarkup(canvas, markup, imgW, imgH) {
  if (!canvas || !markup) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  markup.forEach((item) => {
    const c = MARKUP_COLORS[item.type]?.stroke || "#ffffff";
    if (item.type === "leadingLine") {
      const x1 = item.x1 * imgW, y1 = item.y1 * imgH;
      const x2 = item.x2 * imgW, y2 = item.y2 * imgH;
      drawArrow(ctx, x1, y1, x2, y2, c);

    } else if (item.type === "focalPoint") {
      const x = item.x * imgW, y = item.y * imgH;
      const w = item.width * imgW, h = item.height * imgH;
      ctx.save();
      ctx.strokeStyle = c;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 5]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      const tick = 14;
      [[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]].forEach(([cx,cy,sx,sy]) => {
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + sx*tick, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + sy*tick); ctx.stroke();
      });
      ctx.restore();

    } else if (item.type === "distraction") {
      const x = item.x * imgW, y = item.y * imgH;
      const w = item.width * imgW, h = item.height * imgH;
      ctx.save();
      ctx.strokeStyle = c;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x, y, w, h);
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 6); ctx.lineTo(x + w - 6, y + h - 6);
      ctx.moveTo(x + w - 6, y + 6); ctx.lineTo(x + 6, y + h - 6);
      ctx.stroke();
      ctx.restore();

    } else if (item.type === "suggestedCrop") {
      const x = item.x * imgW, y = item.y * imgH;
      const w = item.width * imgW, h = item.height * imgH;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.48)";
      ctx.fillRect(0, 0, imgW, y);
      ctx.fillRect(0, y + h, imgW, imgH - y - h);
      ctx.fillRect(0, y, x, h);
      ctx.fillRect(x + w, y, imgW - x - w, h);
      ctx.strokeStyle = c;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 5]);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }
  });
}

// ─── UI Components ────────────────────────────────────────────────────────────

function GradeBadge({ grade }) {
  const color = grade.startsWith("A") ? "#7fba8a" : grade.startsWith("B") ? "#c9a84c" : grade.startsWith("C") ? "#c97c4c" : "#c95c5c";
  return (
    <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:"52px", height:"52px", borderRadius:"50%", background:`${color}22`, border:`2px solid ${color}`, color, fontFamily:"'Playfair Display',Georgia,serif", fontSize:"1.2rem", fontWeight:"700", flexShrink:0 }}>
      {grade}
    </span>
  );
}

function OverallGrade({ grade }) {
  const color = grade.startsWith("A") ? "#7fba8a" : grade.startsWith("B") ? "#c9a84c" : grade.startsWith("C") ? "#c97c4c" : "#c95c5c";
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"6px" }}>
      <span style={{ fontSize:"0.65rem", letterSpacing:"0.18em", textTransform:"uppercase", color:"#8a9080", fontFamily:"'DM Mono',monospace" }}>Overall</span>
      <div style={{ width:"80px", height:"80px", borderRadius:"50%", background:`${color}18`, border:`3px solid ${color}`, display:"flex", alignItems:"center", justifyContent:"center", color, fontFamily:"'Playfair Display',Georgia,serif", fontSize:"1.9rem", fontWeight:"700" }}>
        {grade}
      </div>
    </div>
  );
}

function Section({ section, index }) {
  const [open, setOpen] = useState(true);
  const icons = ["◎","→","⊞","◑"];
  return (
    <div style={{ border:"1px solid #2a3028", borderRadius:"12px", overflow:"hidden", background:"#141a13", animation:`slideUp 0.4s ease ${index*0.08}s both` }}>
      <button onClick={() => setOpen(!open)} style={{ width:"100%", display:"flex", alignItems:"center", gap:"14px", padding:"18px 22px", background:"none", border:"none", cursor:"pointer", textAlign:"left" }}>
        <span style={{ color:"#6a8a68", fontSize:"1.1rem" }}>{icons[index]}</span>
        <span style={{ flex:1, fontFamily:"'Playfair Display',Georgia,serif", fontSize:"1rem", color:"#d4dac8", fontWeight:"600" }}>{section.name}</span>
        <GradeBadge grade={section.grade} />
        <span style={{ color:"#6a8a68", fontSize:"0.8rem", marginLeft:"8px" }}>{open?"▲":"▼"}</span>
      </button>
      {open && (
        <div style={{ padding:"0 22px 22px" }}>
          <div style={{ width:"100%", height:"1px", background:"#2a3028", marginBottom:"18px" }} />
          <p style={{ color:"#9aaa8a", fontSize:"0.92rem", lineHeight:"1.75", margin:"0 0 16px", fontFamily:"'Lora',Georgia,serif" }}>{section.analysis}</p>
          <div style={{ background:"#1c2a1a", border:"1px solid #3a5038", borderRadius:"8px", padding:"14px 16px" }}>
            <p style={{ fontSize:"0.65rem", letterSpacing:"0.16em", textTransform:"uppercase", color:"#8aaa70", fontFamily:"'DM Mono',monospace", margin:"0 0 8px" }}>In-Camera Improvements</p>
            <p style={{ color:"#b0c8a0", fontSize:"0.88rem", lineHeight:"1.7", margin:0, fontFamily:"'Lora',Georgia,serif" }}>{section.improvements}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function MarkupLegend({ markup, visibleTypes, onToggle }) {
  const seen = {};
  markup.forEach(m => { if (!seen[m.type]) seen[m.type] = true; });
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:"10px" }}>
      {Object.keys(seen).map(type => {
        const { stroke, label } = MARKUP_COLORS[type] || {};
        const active = visibleTypes.includes(type);
        return (
          <button
            key={type}
            onClick={() => onToggle(type)}
            style={{ display:"flex", alignItems:"center", gap:"7px", background: active ? "#0d1209" : "#0d120944", border:`1px solid ${active ? stroke+"55" : stroke+"22"}`, borderRadius:"6px", padding:"5px 12px", cursor:"pointer", transition:"all 0.2s ease", opacity: active ? 1 : 0.45 }}
          >
            <span style={{ width:"9px", height:"9px", borderRadius:"50%", background: active ? stroke : "transparent", border:`2px solid ${stroke}`, flexShrink:0, transition:"all 0.2s ease" }} />
            <span style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.65rem", letterSpacing:"0.1em", textTransform:"uppercase", color: active ? stroke : stroke+"88", transition:"all 0.2s ease" }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem("fcc_api_key") || "");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [image, setImage] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMediaType, setImageMediaType] = useState("image/jpeg");
  const [loading, setLoading] = useState(false);
  const [critique, setCritique] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [visibleTypes, setVisibleTypes] = useState(Object.keys(MARKUP_COLORS));
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });

  const saveApiKey = () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) return;
    sessionStorage.setItem("fcc_api_key", trimmed);
    setApiKey(trimmed);
    setApiKeyInput("");
    setShowKeyForm(false);
  };

  const fileRef = useRef();
  const canvasRef = useRef();
  const imgRef = useRef();

  useEffect(() => {
    if (critique?.markup && imgDims.w && canvasRef.current) {
      canvasRef.current.width = imgDims.w;
      canvasRef.current.height = imgDims.h;
      const filtered = critique.markup.filter(m => visibleTypes.includes(m.type));
      renderMarkup(canvasRef.current, filtered, imgDims.w, imgDims.h);
    }
  }, [critique, imgDims, visibleTypes]);

  const resizeToUnder4MB = (dataUrl, mimeType) => {
    return new Promise((resolve) => {
      const MAX_BYTES = 2 * 1024 * 1024;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        let quality = 0.92;
        const outputType = mimeType === "image/png" ? "image/png" : "image/jpeg";
        const tryEncode = () => {
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          const result = canvas.toDataURL(outputType, quality);
          const base64 = result.split(",")[1];
          const bytes = Math.ceil((base64.length * 3) / 4);
          if (bytes <= MAX_BYTES || (width < 400 && quality < 0.5)) {
            resolve({ dataUrl: result, base64, mimeType: outputType });
          } else if (quality > 0.5) {
            quality -= 0.1; tryEncode();
          } else {
            width = Math.floor(width * 0.8); height = Math.floor(height * 0.8); quality = 0.85; tryEncode();
          }
        };
        tryEncode();
      };
      img.src = dataUrl;
    });
  };

  const processFile = useCallback((file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    // Accept any image; unsupported formats will be converted to JPEG via canvas
    const reader = new FileReader();
    reader.onload = async (e) => {
      const typeMap = { heic:"image/jpeg", heif:"image/jpeg", png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg" };
      const detectedType = file.type && file.type !== "" ? file.type : (typeMap[ext] || "image/jpeg");
      const supportedTypes = ["image/png", "image/jpeg"];
      // Convert unsupported formats (heic, heif, webp, tiff, etc.) to jpeg via canvas
      const mimeForCanvas = supportedTypes.includes(detectedType) ? detectedType : "image/jpeg";
      const { dataUrl, base64, mimeType } = await resizeToUnder4MB(e.target.result, mimeForCanvas);
      setImage(dataUrl); setImageBase64(base64); setImageMediaType(mimeType);
      setCritique(null); setError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    processFile(e.dataTransfer.files[0]);
  }, [processFile]);

  const analyze = async () => {
    if (!imageBase64) return;
    setLoading(true); setError(null); setCritique(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-opus-4-5",
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          messages: [{
            role: "user",
            content: [
              { type:"image", source:{ type:"base64", media_type: imageMediaType, data: imageBase64 } },
              { type:"text", text:"Please mark up and critique this landscape photo." }
            ]
          }]
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(`API Error: ${errData?.error?.message || `HTTP ${res.status}`}`);
      }
      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setCritique(parsed);
    } catch (err) {
      setError(err.message || "An unknown error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleImgLoad = () => {
    if (imgRef.current) {
      const w = imgRef.current.offsetWidth;
      const h = imgRef.current.offsetHeight;
      setImgDims({ w, h });
    }
  };

  const reset = () => { setImage(null); setImageBase64(null); setCritique(null); setError(null); setVisibleTypes(Object.keys(MARKUP_COLORS)); };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lora:ital,wght@0,400;0,500;1,400&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        body { background:#0d1209; min-height:100vh; }
        @keyframes slideUp { from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0}to{opacity:1} }
        @keyframes spin { to{transform:rotate(360deg)} }
        .upload-zone{border:2px dashed #2a4028;border-radius:16px;background:#111709;transition:all 0.2s ease;cursor:pointer;}
        .upload-zone:hover,.upload-zone.drag-over{border-color:#4a7040;background:#141e10;}
        .btn-primary{background:#3a5c30;color:#c8dbb8;border:none;border-radius:10px;padding:14px 32px;font-family:'DM Mono',monospace;font-size:0.85rem;letter-spacing:0.12em;text-transform:uppercase;cursor:pointer;transition:all 0.2s ease;}
        .btn-primary:hover:not(:disabled){background:#4a7040;transform:translateY(-1px);box-shadow:0 6px 20px #3a5c3044;}
        .btn-primary:disabled{opacity:0.5;cursor:not-allowed;}
        .btn-outline{background:transparent;color:#7fba8a;border:2px solid #7fba8a;border-radius:10px;padding:12px 28px;font-family:'DM Mono',monospace;font-size:0.8rem;letter-spacing:0.12em;text-transform:uppercase;cursor:pointer;transition:all 0.2s ease;}
        .btn-outline:hover{background:#7fba8a18;transform:translateY(-1px);}
        .spinner{width:20px;height:20px;border:2px solid #3a5c3060;border-top-color:#7fba8a;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;}
        ::-webkit-scrollbar{width:6px;}
        ::-webkit-scrollbar-track{background:#0d1209;}
        ::-webkit-scrollbar-thumb{background:#2a4028;border-radius:3px;}
      `}</style>

      <div style={{ minHeight:"100vh", background:"#0d1209", color:"#d4dac8", fontFamily:"'Lora',Georgia,serif" }}>

        {/* Header */}
        <div style={{ borderBottom:"1px solid #1e2a1c", padding:"20px 0", background:"#0d1209", position:"sticky", top:0, zIndex:10 }}>
          <div style={{ maxWidth:"780px", margin:"0 auto", padding:"0 24px", display:"flex", alignItems:"center", gap:"14px" }}>
            <div style={{ fontSize:"1.5rem" }}>◉</div>
            <div style={{ flex:1 }}>
              <h1 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:"1.25rem", fontWeight:"700", color:"#c8d8b0" }}>Field Composition Coach</h1>
              <p style={{ fontSize:"0.7rem", color:"#8a9a78", fontFamily:"'DM Mono',monospace", letterSpacing:"0.1em", textTransform:"uppercase" }}>Landscape Photography</p>
            </div>
            {apiKey ? (
              <button
                onClick={() => { setShowKeyForm(v => !v); setApiKeyInput(""); }}
                style={{ background:"transparent", border:"1px solid #4a6a48", borderRadius:"7px", padding:"6px 14px", fontFamily:"'DM Mono',monospace", fontSize:"0.65rem", letterSpacing:"0.1em", textTransform:"uppercase", color:"#8aaa70", cursor:"pointer" }}
              >
                {showKeyForm ? "Cancel" : "API Key ✓"}
              </button>
            ) : (
              <button
                onClick={() => setShowKeyForm(true)}
                style={{ background:"#3a1a1a", border:"1px solid #7a3030", borderRadius:"7px", padding:"6px 14px", fontFamily:"'DM Mono',monospace", fontSize:"0.65rem", letterSpacing:"0.1em", textTransform:"uppercase", color:"#c87070", cursor:"pointer" }}
              >
                Set API Key
              </button>
            )}
          </div>

          {/* API Key form */}
          {showKeyForm && (
            <div style={{ maxWidth:"780px", margin:"12px auto 0", padding:"0 24px" }}>
              <div style={{ background:"#111709", border:"1px solid #2a4028", borderRadius:"10px", padding:"16px 20px", display:"flex", gap:"10px", alignItems:"center" }}>
                <input
                  type="password"
                  placeholder="sk-ant-..."
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && saveApiKey()}
                  style={{ flex:1, background:"#0d1209", border:"1px solid #2a4028", borderRadius:"7px", padding:"9px 14px", color:"#c8dbb8", fontFamily:"'DM Mono',monospace", fontSize:"0.82rem", outline:"none" }}
                />
                <button className="btn-primary" onClick={saveApiKey} style={{ padding:"9px 20px", whiteSpace:"nowrap" }}>Save Key</button>
              </div>
              <p style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.62rem", color:"#6a8a68", letterSpacing:"0.08em", marginTop:"8px", paddingLeft:"4px" }}>
                Your key is stored in session memory only — it's never sent anywhere except Anthropic's API.
              </p>
            </div>
          )}
        </div>

        <div style={{ maxWidth:"780px", margin:"0 auto", padding:"40px 24px 80px" }}>

          {/* Upload zone */}
          {!critique && (
            <>
              <div
                className={`upload-zone ${dragOver?"drag-over":""}`}
                onDragOver={(e)=>{e.preventDefault();setDragOver(true);}}
                onDragLeave={()=>setDragOver(false)}
                onDrop={handleDrop}
                onClick={()=>fileRef.current?.click()}
                style={{ aspectRatio:"1/1", width:"50%", margin:"0 auto 24px", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", padding: image?"0":"24px", textAlign:"center" }}
              >
                <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={(e)=>processFile(e.target.files[0])} />
                {image ? (
                  <div style={{ position:"relative", width:"100%", height:"100%" }}>
                    <img src={image} alt="preview" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block", borderRadius:"14px" }} />
                    <div style={{ position:"absolute", bottom:"12px", right:"12px", background:"#0d120988", backdropFilter:"blur(8px)", border:"1px solid #2a4028", borderRadius:"6px", padding:"6px 12px", fontSize:"0.7rem", fontFamily:"'DM Mono',monospace", color:"#8ab880", letterSpacing:"0.1em" }}>Click to change</div>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"10px", height:"100%", width:"100%" }}>
                    <div style={{ fontSize:"2.5rem", color:"#6a8a68" }}>⬡</div>
                    <p style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:"1rem", color:"#8a9a78" }}>Drop your landscape photo here</p>
                    <p style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.65rem", color:"#6a8a68", letterSpacing:"0.1em", textTransform:"uppercase" }}>or click to browse</p>
                  </div>
                )}
              </div>

              {image && (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"10px", marginBottom:"32px" }}>
                  {!apiKey && (
                    <p style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.7rem", color:"#c87070", letterSpacing:"0.08em" }}>
                      ↑ Set your Anthropic API key above to analyze
                    </p>
                  )}
                  <button className="btn-primary" onClick={apiKey ? analyze : () => setShowKeyForm(true)} disabled={loading}>
                    {loading ? (
                      <span style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                        <span className="spinner" /> Analyzing composition...
                      </span>
                    ) : "Analyze Composition"}
                  </button>
                </div>
              )}

              {!image && (
                <div style={{ textAlign:"center", marginTop:"60px" }}>
                  <p style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:"1rem", color:"#6a8a68", marginBottom:"12px" }}>Upload a landscape photo to receive a detailed<br />in-field composition critique</p>
                  <p style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.68rem", color:"#6a8a68", letterSpacing:"0.12em", textTransform:"uppercase" }}>Subject · Lines · Balance · Mood</p>
                </div>
              )}
            </>
          )}

          {/* Error */}
          {error && (
            <div style={{ background:"#2a1010", border:"1px solid #5a2020", borderRadius:"10px", padding:"16px 20px", color:"#c88080", fontFamily:"'DM Mono',monospace", fontSize:"0.82rem", marginBottom:"32px" }}>
              {error}
            </div>
          )}

          {/* ── Full results: markup + critique ── */}
          {critique && (
            <div style={{ animation:"fadeIn 0.5s ease" }}>

              {/* Markup photo */}
              <div style={{ background:"#111709", border:"1px solid #2a3028", borderRadius:"16px", overflow:"hidden", marginBottom:"16px" }}>
                <div style={{ padding:"18px 24px", borderBottom:"1px solid #1e2a1c" }}>
                  <p style={{ fontSize:"0.62rem", letterSpacing:"0.18em", textTransform:"uppercase", color:"#6a8a68", fontFamily:"'DM Mono',monospace", marginBottom:"4px" }}>Composition Markup</p>
                  <h2 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:"1.3rem", fontWeight:"700", color:"#d8e8c0" }}>{critique.title}</h2>
                </div>
                <div style={{ position:"relative", lineHeight:0 }}>
                  <img ref={imgRef} src={image} alt="Marked up" onLoad={handleImgLoad} style={{ width:"100%", display:"block" }} />
                  <canvas ref={canvasRef} style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", pointerEvents:"none" }} />
                </div>
                <div style={{ padding:"16px 24px 20px" }}>
                  <MarkupLegend markup={critique.markup} visibleTypes={visibleTypes} onToggle={(type) => setVisibleTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])} />
                  <div style={{ display:"flex", flexDirection:"column", gap:"6px", marginTop:"12px" }}>
                    {critique.markup.filter(item => visibleTypes.includes(item.type)).map((item, i) => {
                      const { stroke } = MARKUP_COLORS[item.type] || {};
                      return (
                        <div key={i} style={{ display:"flex", gap:"10px", alignItems:"baseline" }}>
                          <span style={{ width:"7px", height:"7px", borderRadius:"50%", background:stroke, flexShrink:0, marginTop:"6px" }} />
                          <p style={{ fontFamily:"'Lora',Georgia,serif", fontSize:"0.85rem", color:"#8a9a7a", lineHeight:"1.6", margin:0 }}>
                            <span style={{ color:stroke, fontFamily:"'DM Mono',monospace", fontSize:"0.62rem", letterSpacing:"0.1em", textTransform:"uppercase", marginRight:"8px" }}>{MARKUP_COLORS[item.type]?.label}</span>
                            {item.label}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Full critique header */}
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:"20px", marginBottom:"28px", padding:"28px", background:"#111709", border:"1px solid #2a3028", borderRadius:"16px" }}>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:"0.65rem", letterSpacing:"0.18em", textTransform:"uppercase", color:"#6a8a68", fontFamily:"'DM Mono',monospace", marginBottom:"8px" }}>Full Critique</p>
                  <h2 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:"1.5rem", fontWeight:"700", color:"#d8e8c0", lineHeight:"1.3", marginBottom:"18px" }}>{critique.title}</h2>
                  <p style={{ color:"#8aaa7a", fontSize:"0.92rem", lineHeight:"1.8", fontStyle:"italic" }}>{critique.positiveSummary}</p>
                </div>
                <OverallGrade grade={critique.overallGrade} />
              </div>

              {/* Sections */}
              <div style={{ display:"flex", flexDirection:"column", gap:"12px", marginBottom:"28px" }}>
                {critique.sections.map((section, i) => <Section key={section.name} section={section} index={i} />)}
              </div>

              {/* Actionable summary */}
              <div style={{ background:"#1a2e18", border:"1px solid #3a5838", borderRadius:"16px", padding:"28px", marginBottom:"36px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"20px" }}>
                  <span style={{ fontSize:"1.1rem" }}>◉</span>
                  <div>
                    <p style={{ fontSize:"0.62rem", letterSpacing:"0.18em", textTransform:"uppercase", color:"#8aaa70", fontFamily:"'DM Mono',monospace", marginBottom:"2px" }}>Act Now · In Camera</p>
                    <h3 style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:"1.1rem", color:"#b0d098", fontWeight:"700" }}>{critique.actionableSummary.headline}</h3>
                  </div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
                  {critique.actionableSummary.actions.map((action, i) => (
                    <div key={i} style={{ display:"flex", gap:"14px", alignItems:"flex-start", background:"#142012", borderRadius:"10px", padding:"14px 16px" }}>
                      <span style={{ fontFamily:"'DM Mono',monospace", fontSize:"0.7rem", color:"#b0d098", background:"#2a4828", borderRadius:"4px", padding:"3px 8px", flexShrink:0, marginTop:"1px" }}>{String(i+1).padStart(2,"0")}</span>
                      <p style={{ color:"#a0c888", fontSize:"0.9rem", lineHeight:"1.65", fontFamily:"'Lora',Georgia,serif" }}>{action}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display:"flex", justifyContent:"center" }}>
                <button className="btn-primary" onClick={reset}>Critique Another Photo</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
