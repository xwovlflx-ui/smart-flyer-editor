(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const canvas = $("flyerCanvas");
  const ctx = canvas.getContext("2d");
  const els = {
    stage: $("canvasStage"),
    empty: $("emptyState"),
    status: $("canvasStatus"),
    zoomLabel: $("zoomLabel"),
    templates: $("templateList"),
    form: $("propertyForm"),
    noLayer: $("noLayerMessage"),
    tip: $("dragTip"),
    text: $("layerText"),
    type: $("layerType"),
    color: $("layerColor"),
    colorText: $("colorText"),
    font: $("layerFont"),
    size: $("layerSize"),
    sizeOut: $("fontSizeOutput"),
    weight: $("layerWeight"),
    x: $("layerX"),
    y: $("layerY"),
    replaceFields: $("replaceFields"),
    coverColor: $("coverColor"),
    coverColorText: $("coverColorText"),
    coverX: $("coverX"),
    coverY: $("coverY"),
    coverW: $("coverW"),
    coverH: $("coverH"),
    align: $("layerAlign"),
    toast: $("toast"),
  };
  const STORE_KEY = "smart-flyer-editor-templates-v2";
  let state = {
    templates: [],
    activeId: null,
    image: null,
    selectedId: null,
    zoom: 1,
    drag: null,
    selection: null,
    mode: null,
  };

  const uid = () =>
    `layer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const defaultTemplate = () => ({
    id: uid(),
    name: "새 전단지",
    imageSrc: null,
    width: 1080,
    height: 1350,
    layers: [],
    updatedAt: Date.now(),
  });
  const current = () =>
    state.templates.find((template) => template.id === state.activeId);
  const selected = () =>
    current()?.layers.find((layer) => layer.id === state.selectedId) || null;
  const hex = (color, fallback = "#1455E6") =>
    /^#[0-9a-f]{6}$/i.test(color || "") ? color.toUpperCase() : fallback;
  const num = (value, fallback = 0) =>
    Number.isFinite(Number(value)) ? Number(value) : fallback;

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => els.toast.classList.remove("show"), 2600);
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state.templates));
    } catch (_) {
      toast(
        "이미지가 커서 브라우저 자동 저장 공간이 부족합니다. JSON 저장으로 백업하세요.",
      );
    }
  }
  function formatPhone(value) {
    const digits = String(value).replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, digits.length === 10 ? 6 : 7)}-${digits.slice(digits.length === 10 ? 6 : 7)}`;
  }
  function defaultText(type) {
    return (
      {
        전화번호: "010-1234-5678",
        월요금: "월 7,700원",
        사은품: "사은품 증정",
        설치비: "설치비 면제",
        할인금액: "50% 할인",
        상품명: "상품명",
        추가문구: "새 문구",
      }[type] || "새 문구"
    );
  }
  function normalizeLayer(layer) {
    const normalized = {
      id: layer.id || uid(),
      type: layer.type || "추가문구",
      text: String(layer.text || ""),
      x: num(layer.x),
      y: num(layer.y),
      font: layer.font || "Noto Sans KR",
      size: Math.max(12, num(layer.size, 46)),
      weight: String(layer.weight || "700"),
      color: hex(layer.color),
      replace: Boolean(layer.replace),
      coverX: num(layer.coverX),
      coverY: num(layer.coverY),
      coverW: Math.max(1, num(layer.coverW, 100)),
      coverH: Math.max(1, num(layer.coverH, 50)),
      coverColor: hex(layer.coverColor, "#FFFFFF"),
      align: layer.align || "left",
    };
    if (normalized.type === "전화번호")
      normalized.text = formatPhone(normalized.text);
    return normalized;
  }
  function sanitizeTemplate(template) {
    return {
      id: template?.id || uid(),
      name: String(template?.name || "불러온 전단지"),
      imageSrc: template?.imageSrc || null,
      width: num(template?.width, 1080),
      height: num(template?.height, 1350),
      layers: Array.isArray(template?.layers)
        ? template.layers.map(normalizeLayer)
        : [],
      updatedAt: Date.now(),
    };
  }
  function init() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(STORE_KEY) ||
          localStorage.getItem("smart-flyer-editor-templates-v1"),
      );
      if (Array.isArray(saved) && saved.length)
        state.templates = saved.map(sanitizeTemplate);
    } catch (_) {
      /* New workspace. */
    }
    if (!state.templates.length) state.templates = [defaultTemplate()];
    state.activeId = state.templates[0].id;
    selectTemplate(state.activeId);
  }

  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character],
    );
  }
  function renderTemplates() {
    els.templates.innerHTML = "";
    state.templates.forEach((template) => {
      const button = document.createElement("button");
      button.className = `template-item${template.id === state.activeId ? " active" : ""}`;
      button.type = "button";
      const thumb = document.createElement("div");
      thumb.className = "template-thumb";
      if (template.imageSrc) {
        const image = new Image();
        image.src = template.imageSrc;
        thumb.append(image);
      }
      const words = document.createElement("span");
      words.innerHTML = `<strong>${escapeHtml(template.name)}</strong><small>${template.layers.length}개 편집 레이어</small>`;
      button.append(thumb, words);
      button.onclick = () => selectTemplate(template.id);
      els.templates.append(button);
    });
  }
  function selectTemplate(id) {
    state.activeId = id;
    state.selectedId = null;
    state.mode = null;
    state.selection = null;
    const template = current();
    if (template.imageSrc) loadImage(template.imageSrc, false);
    else {
      state.image = null;
      setupCanvas(template.width, template.height);
      draw();
    }
    renderTemplates();
    updateProperties();
    updateGuide();
  }
  function loadImage(src, notify = true) {
    const image = new Image();
    image.onload = () => {
      state.image = image;
      const template = current();
      template.imageSrc = src;
      template.width = image.naturalWidth;
      template.height = image.naturalHeight;
      setupCanvas(template.width, template.height);
      draw();
      save();
      renderTemplates();
      updateGuide();
      if (notify)
        toast(
          `원본 ${image.naturalWidth} × ${image.naturalHeight}px 이미지를 불러왔습니다.`,
        );
    };
    image.onerror = () => toast("이미지를 불러올 수 없습니다.");
    image.src = src;
  }
  function setupCanvas(width, height) {
    canvas.width = width;
    canvas.height = height;
    const scale = Math.min(620 / width, 640 / height, 1);
    canvas.style.width = `${Math.round(width * scale)}px`;
    canvas.style.height = `${Math.round(height * scale)}px`;
    els.stage.style.width = canvas.style.width;
    els.stage.style.minHeight = canvas.style.height;
    els.stage.classList.toggle("has-image", Boolean(state.image));
    els.empty.hidden = Boolean(state.image);
    els.status.textContent = state.image
      ? `${width} × ${height}px · 원본 해상도`
      : "이미지를 업로드해 시작하세요";
    els.status.parentElement.classList.toggle("ready", Boolean(state.image));
  }

  function textMetrics(layer) {
    ctx.save();
    ctx.font = `${layer.weight} ${layer.size}px "${layer.font}"`;
    const lines = layer.text.split("\n");
    const width = Math.max(
      20,
      ...lines.map((line) => ctx.measureText(line).width),
    );
    ctx.restore();
    return {
      width,
      height: Math.max(layer.size * 1.25, lines.length * layer.size * 1.25),
      lines,
    };
  }
  function alignText(layer) {
    if (!layer.replace) return;
    const metric = textMetrics(layer);
    const padding = Math.max(4, Math.round(layer.size * 0.16));
    if (layer.align === "center")
      layer.x = Math.round(layer.coverX + (layer.coverW - metric.width) / 2);
    else if (layer.align === "right")
      layer.x = Math.round(
        layer.coverX + layer.coverW - metric.width - padding,
      );
    else layer.x = Math.round(layer.coverX + padding);
    layer.y = Math.round(
      layer.coverY + Math.max(0, (layer.coverH - metric.height) / 2),
    );
  }
  function layerBounds(layer) {
    if (layer.replace)
      return {
        x: layer.coverX,
        y: layer.coverY,
        w: layer.coverW,
        h: layer.coverH,
      };
    const metric = textMetrics(layer);
    return { x: layer.x, y: layer.y, w: metric.width, h: metric.height };
  }
  function drawLayer(layer, isSelected) {
    const metric = textMetrics(layer);
    const bounds = layerBounds(layer);
    ctx.save();
    if (layer.replace) {
      ctx.fillStyle = layer.coverColor;
      ctx.fillRect(layer.coverX, layer.coverY, layer.coverW, layer.coverH);
    }
    ctx.font = `${layer.weight} ${layer.size}px "${layer.font}"`;
    ctx.textBaseline = "top";
    ctx.fillStyle = layer.color;
    metric.lines.forEach((line, index) =>
      ctx.fillText(line, layer.x, layer.y + index * layer.size * 1.25),
    );
    if (isSelected) {
      ctx.strokeStyle = "#1a67ff";
      ctx.lineWidth = Math.max(2, Math.round(layer.size / 22));
      ctx.setLineDash([
        Math.max(5, layer.size / 6),
        Math.max(3, layer.size / 10),
      ]);
      ctx.strokeRect(bounds.x - 5, bounds.y - 5, bounds.w + 10, bounds.h + 10);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
  function drawSelection() {
    if (!state.selection) return;
    const { start, current: point } = state.selection;
    const x = Math.min(start.x, point.x),
      y = Math.min(start.y, point.y),
      w = Math.abs(point.x - start.x),
      h = Math.abs(point.y - start.y);
    ctx.save();
    ctx.fillStyle = "rgba(25,87,210,.14)";
    ctx.strokeStyle = "#1957d2";
    ctx.lineWidth = Math.max(2, canvas.width / 450);
    ctx.setLineDash([10, 7]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }
  function draw() {
    const template = current();
    if (!template) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (state.image)
      ctx.drawImage(state.image, 0, 0, canvas.width, canvas.height);
    else {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    template.layers.forEach((layer) =>
      drawLayer(layer, layer.id === state.selectedId),
    );
    drawSelection();
  }
  function updateGuide() {
    if (state.mode) {
      const label = state.mode.type === "전화번호" ? "전화번호" : "문구";
      els.status.textContent = `교체할 기존 ${label} 영역을 드래그하세요`;
      els.tip.textContent = `드래그를 마치면 기존 ${label}이 배경색으로 가려지고, 오른쪽에서 새 내용을 입력할 수 있습니다.`;
      canvas.style.cursor = "crosshair";
      return;
    }
    els.tip.textContent =
      "‘문구 교체’를 누른 후 기존 문구 영역을 드래그하면, 그 영역을 가리고 새 문구로 바꿀 수 있습니다.";
    canvas.style.cursor = state.image ? "crosshair" : "default";
  }

  function updateProperties() {
    const layer = selected();
    els.form.classList.toggle("visible", Boolean(layer));
    els.noLayer.hidden = Boolean(layer);
    if (!layer) return;
    els.text.value = layer.text;
    els.type.value = layer.type;
    els.color.value = hex(layer.color);
    els.colorText.value = hex(layer.color);
    els.font.value = layer.font;
    els.size.value = layer.size;
    els.sizeOut.value = `${layer.size} px`;
    els.weight.value = layer.weight;
    els.x.value = Math.round(layer.x);
    els.y.value = Math.round(layer.y);
    els.replaceFields.classList.toggle("visible", layer.replace);
    if (layer.replace) {
      els.coverColor.value = hex(layer.coverColor, "#FFFFFF");
      els.coverColorText.value = hex(layer.coverColor, "#FFFFFF");
      els.align.value = layer.align;
      els.coverX.value = Math.round(layer.coverX);
      els.coverY.value = Math.round(layer.coverY);
      els.coverW.value = Math.round(layer.coverW);
      els.coverH.value = Math.round(layer.coverH);
    }
  }
  function changeLayer() {
    const layer = selected();
    if (!layer) return;
    const oldX = layer.x,
      oldY = layer.y;
    layer.type = els.type.value;
    layer.text =
      layer.type === "전화번호" ? formatPhone(els.text.value) : els.text.value;
    if (layer.type === "전화번호" && els.text.value !== layer.text)
      els.text.value = layer.text;
    layer.color = hex(els.color.value);
    layer.font = els.font.value;
    layer.size = num(els.size.value, layer.size);
    layer.weight = els.weight.value;
    const nextX = Math.max(0, num(els.x.value, layer.x)),
      nextY = Math.max(0, num(els.y.value, layer.y));
    if (layer.replace) {
      layer.coverX = Math.max(0, num(els.coverX.value, layer.coverX));
      layer.coverY = Math.max(0, num(els.coverY.value, layer.coverY));
      layer.coverW = Math.max(1, num(els.coverW.value, layer.coverW));
      layer.coverH = Math.max(1, num(els.coverH.value, layer.coverH));
      layer.coverColor = hex(els.coverColor.value, "#FFFFFF");
      layer.align = els.align.value;
      layer.coverX += nextX - oldX;
      layer.coverY += nextY - oldY;
      alignText(layer);
    } else {
      layer.x = nextX;
      layer.y = nextY;
    }
    current().updatedAt = Date.now();
    els.sizeOut.value = `${layer.size} px`;
    els.colorText.value = layer.color;
    draw();
    save();
    renderTemplates();
    updateProperties();
  }
  function addLayer(type = "추가문구") {
    if (!state.image) return toast("먼저 전단지 이미지를 업로드하세요.");
    const template = current();
    const layer = normalizeLayer({
      type,
      text: defaultText(type),
      x: Math.round(template.width * 0.1),
      y: Math.round(template.height * 0.1) + template.layers.length * 55,
      size: Math.max(28, Math.round(template.width * 0.045)),
      color: "#1455E6",
    });
    template.layers.push(layer);
    state.selectedId = layer.id;
    save();
    draw();
    renderTemplates();
    updateProperties();
  }
  function setReplaceMode(type, editId = null) {
    if (!state.image) return toast("먼저 전단지 이미지를 업로드하세요.");
    state.mode = { type, editId };
    state.selectedId = null;
    state.selection = null;
    draw();
    updateProperties();
    updateGuide();
  }
  function sampledColor(rect) {
    const points = [
      [rect.x - 2, rect.y - 2],
      [rect.x + rect.w + 2, rect.y - 2],
      [rect.x - 2, rect.y + rect.h + 2],
      [rect.x + rect.w + 2, rect.y + rect.h + 2],
    ];
    const values = points.map(([x, y]) => {
      const safeX = Math.max(0, Math.min(canvas.width - 1, Math.round(x))),
        safeY = Math.max(0, Math.min(canvas.height - 1, Math.round(y)));
      return ctx.getImageData(safeX, safeY, 1, 1).data;
    });
    const average = [0, 1, 2].map((index) =>
      Math.round(
        values.reduce((sum, value) => sum + value[index], 0) / values.length,
      ),
    );
    return `#${average
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()}`;
  }
  function finishSelection() {
    const selection = state.selection;
    if (!selection || !state.mode) return;
    const rect = {
      x: Math.round(Math.min(selection.start.x, selection.current.x)),
      y: Math.round(Math.min(selection.start.y, selection.current.y)),
      w: Math.round(Math.abs(selection.current.x - selection.start.x)),
      h: Math.round(Math.abs(selection.current.y - selection.start.y)),
    };
    state.selection = null;
    if (rect.w < 12 || rect.h < 12) {
      toast("교체할 문구를 조금 더 넓게 드래그해 선택하세요.");
      draw();
      return;
    }
    const mode = state.mode;
    const existing = mode.editId
      ? current().layers.find((layer) => layer.id === mode.editId)
      : null;
    if (existing) {
      existing.coverX = rect.x;
      existing.coverY = rect.y;
      existing.coverW = rect.w;
      existing.coverH = rect.h;
      existing.coverColor = sampledColor(rect);
      alignText(existing);
      state.selectedId = existing.id;
    } else {
      const layer = normalizeLayer({
        type: mode.type,
        text: defaultText(mode.type),
        replace: true,
        coverX: rect.x,
        coverY: rect.y,
        coverW: rect.w,
        coverH: rect.h,
        coverColor: sampledColor(rect),
        align: "center",
        size: Math.max(
          14,
          Math.min(
            Math.round(rect.h * 0.7),
            Math.round(current().width * 0.09),
          ),
        ),
        color: mode.type === "전화번호" ? "#163B84" : "#1455E6",
      });
      alignText(layer);
      current().layers.push(layer);
      state.selectedId = layer.id;
    }
    state.mode = null;
    save();
    draw();
    renderTemplates();
    updateProperties();
    updateGuide();
  }

  function imagePoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }
  function hitLayer(point) {
    const layers = current().layers;
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      const layer = layers[index],
        bounds = layerBounds(layer);
      if (
        point.x >= bounds.x - 10 &&
        point.x <= bounds.x + bounds.w + 10 &&
        point.y >= bounds.y - 10 &&
        point.y <= bounds.y + bounds.h + 10
      )
        return layer;
    }
    return null;
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (!state.image) return;
    const point = imagePoint(event);
    canvas.setPointerCapture(event.pointerId);
    if (state.mode) {
      state.selection = { start: point, current: point };
      draw();
      return;
    }
    const layer = hitLayer(point);
    state.selectedId = layer?.id || null;
    if (layer)
      state.drag = {
        id: layer.id,
        start: point,
        x: layer.x,
        y: layer.y,
        coverX: layer.coverX,
        coverY: layer.coverY,
      };
    draw();
    updateProperties();
  });
  canvas.addEventListener("pointermove", (event) => {
    const point = imagePoint(event);
    if (state.selection) {
      state.selection.current = point;
      draw();
      return;
    }
    if (!state.drag) return;
    const layer = selected();
    if (!layer) return;
    const dx = Math.round(point.x - state.drag.start.x),
      dy = Math.round(point.y - state.drag.start.y);
    layer.x = Math.max(0, state.drag.x + dx);
    layer.y = Math.max(0, state.drag.y + dy);
    if (layer.replace) {
      layer.coverX = Math.max(0, state.drag.coverX + dx);
      layer.coverY = Math.max(0, state.drag.coverY + dy);
    }
    draw();
    updateProperties();
  });
  function endPointer() {
    if (state.selection) finishSelection();
    if (state.drag) {
      state.drag = null;
      save();
      renderTemplates();
    }
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  $("imageUpload").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type))
      return toast("PNG 또는 JPG 파일만 올릴 수 있습니다.");
    const reader = new FileReader();
    reader.onload = () => loadImage(reader.result);
    reader.readAsDataURL(file);
    event.target.value = "";
  });
  $("replaceText").onclick = () => setReplaceMode("추가문구");
  $("replacePhone").onclick = () => setReplaceMode("전화번호");
  $("reselectArea").onclick = () => {
    const layer = selected();
    if (layer?.replace) setReplaceMode(layer.type, layer.id);
  };
  $("addLayer").onclick = () => addLayer();
  $("quickLayer").onchange = (event) => {
    if (event.target.value) addLayer(event.target.value);
    event.target.value = "";
  };
  [
    els.text,
    els.type,
    els.color,
    els.font,
    els.size,
    els.weight,
    els.x,
    els.y,
    els.coverColor,
    els.coverX,
    els.coverY,
    els.coverW,
    els.coverH,
    els.align,
  ].forEach((input) => input.addEventListener("input", changeLayer));
  function linkColorText(textInput, colorInput) {
    textInput.addEventListener("change", () => {
      if (/^#[0-9a-f]{6}$/i.test(textInput.value)) {
        colorInput.value = textInput.value;
        changeLayer();
      } else toast("색상은 #1455E6 형식으로 입력하세요.");
    });
  }
  linkColorText(els.colorText, els.color);
  linkColorText(els.coverColorText, els.coverColor);
  $("duplicateLayer").onclick = () => {
    const layer = selected();
    if (!layer) return;
    const copy = normalizeLayer({
      ...layer,
      id: uid(),
      x: layer.x + 20,
      y: layer.y + 20,
      coverX: layer.coverX + 20,
      coverY: layer.coverY + 20,
    });
    current().layers.push(copy);
    state.selectedId = copy.id;
    save();
    draw();
    renderTemplates();
    updateProperties();
  };
  $("deleteLayer").onclick = () => {
    current().layers = current().layers.filter(
      (layer) => layer.id !== state.selectedId,
    );
    state.selectedId = null;
    save();
    draw();
    renderTemplates();
    updateProperties();
  };
  $("newTemplate").onclick = () => {
    const template = defaultTemplate();
    template.name = `새 전단지 ${state.templates.length + 1}`;
    state.templates.unshift(template);
    state.activeId = template.id;
    save();
    selectTemplate(template.id);
    toast("새 템플릿을 만들었습니다.");
  };
  $("deleteTemplate").onclick = () => {
    if (state.templates.length === 1)
      return toast("마지막 템플릿은 삭제할 수 없습니다.");
    state.templates = state.templates.filter(
      (template) => template.id !== state.activeId,
    );
    state.activeId = state.templates[0].id;
    save();
    selectTemplate(state.activeId);
    toast("템플릿을 삭제했습니다.");
  };
  $("jsonExport").onclick = () =>
    downloadBlob(
      JSON.stringify(
        {
          version: 2,
          exportedAt: new Date().toISOString(),
          templates: state.templates,
        },
        null,
        2,
      ),
      "smart-flyer-templates.json",
      "application/json",
    );
  $("jsonImport").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const templates = Array.isArray(data) ? data : data.templates;
        if (!Array.isArray(templates) || !templates.length) throw Error();
        state.templates = templates.map(sanitizeTemplate);
        state.activeId = state.templates[0].id;
        save();
        selectTemplate(state.activeId);
        toast("템플릿을 불러왔습니다.");
      } catch (_) {
        toast("올바른 Smart Flyer JSON 파일이 아닙니다.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  });

  function exportedCanvas() {
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const output = out.getContext("2d");
    const previous = state.selectedId;
    state.selectedId = null;
    draw();
    output.drawImage(canvas, 0, 0);
    state.selectedId = previous;
    draw();
    return out;
  }
  document.querySelectorAll("[data-export]").forEach((button) =>
    button.addEventListener("click", () => {
      if (!state.image) return toast("저장할 전단지 이미지를 업로드하세요.");
      const out = exportedCanvas();
      if (button.dataset.export === "pdf") return exportPDF(out);
      const isPng = button.dataset.export === "png";
      out.toBlob(
        (blob) =>
          downloadBlob(
            blob,
            `smart-flyer.${isPng ? "png" : "jpg"}`,
            isPng ? "image/png" : "image/jpeg",
          ),
        isPng ? undefined : 0.94,
      );
    }),
  );
  function downloadBlob(blob, name, type = "application/octet-stream") {
    if (typeof blob === "string") blob = new Blob([blob], { type });
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`${name} 파일을 저장했습니다.`);
  }
  function exportPDF(out) {
    const jpg = out.toDataURL("image/jpeg", 0.94).split(",")[1],
      binary = atob(jpg),
      imageBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1)
      imageBytes[i] = binary.charCodeAt(i);
    const pageW = 595,
      pageH = Math.max(1, Math.round((pageW * out.height) / out.width)),
      encoder = new TextEncoder(),
      chunks = [],
      offsets = [0];
    let position = 0;
    const push = (value) => {
      const bytes = typeof value === "string" ? encoder.encode(value) : value;
      chunks.push(bytes);
      position += bytes.length;
    };
    const object = (number, content) => {
      offsets[number] = position;
      push(`${number} 0 obj\n`);
      push(content);
      push("\nendobj\n");
    };
    push("%PDF-1.3\n");
    object(1, "<< /Type /Catalog /Pages 2 0 R >>");
    object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    object(
      3,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    );
    offsets[4] = position;
    push(
      `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${out.width} /Height ${out.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
    );
    push(imageBytes);
    push("\nendstream\nendobj\n");
    const stream = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ`;
    object(5, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const xref = position;
    push("xref\n0 6\n0000000000 65535 f \n");
    for (let i = 1; i <= 5; i += 1)
      push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    downloadBlob(
      new Blob(chunks, { type: "application/pdf" }),
      "smart-flyer.pdf",
    );
  }
  function zoom(change) {
    state.zoom = Math.min(
      1.5,
      Math.max(0.55, Math.round((state.zoom + change) * 100) / 100),
    );
    els.stage.style.transform = `scale(${state.zoom})`;
    els.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
  }
  $("zoomIn").onclick = () => zoom(0.1);
  $("zoomOut").onclick = () => zoom(-0.1);
  $("zoomReset").onclick = () => {
    state.zoom = 1;
    zoom(0);
  };
  init();
})();
