/**
 * La Ruletita Cast Receiver - Wheel Renderer
 * Canvas port of the v3 app's WheelCanvas.kt and Pointer.kt.
 *
 * Geometry follows the redesign's 320-unit artboard: wheel radius 150, labels end 135 from the
 * centre, hub radius 14, rim 2.5. The pointer (26 tall, 26 wide) sits 6 above the rim.
 *
 * Rotation convention (shared with the app): slice i starts at canvas angle
 * rotation + i * slice (0° = 3 o'clock, clockwise); the pointer is at 270°.
 */

// v2 palettes, in v2 order. v3 phones send their exact slice colours in WHEEL_STATE.colors,
// so these only apply to phones that haven't updated.
const LEGACY_PALETTES = {
    Classic: ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#FF8B94', '#A8E6CF', '#FFAA85', '#9D84B7'],
    Vibrant: ['#FF1744', '#00E676', '#FFEA00', '#00B0FF', '#FF9100', '#D500F9', '#1DE9B6', '#FF4081'],
    Pastel: ['#FFB5BA', '#B5DEFF', '#FFF6B5', '#B5FFCD', '#E0B5FF', '#FFD9B5', '#B5FFF6', '#FFC8DD'],
    Monochrome: ['#FF6348', '#FF8A70', '#E55039', '#FFB099', '#CC4125', '#FFD4C2', '#B33620', '#FF7F5E']
};

// The app's dark theme (ui/theme/Color.kt)
const THEME = {
    surface: '#201A19',
    onSurface: '#EDE0DE',
    onSurfaceVariant: '#D8C2BE',
    outlineVariant: '#534341',
    primary: '#FFB4A4'
};

const ART_RADIUS = 150;
const LABEL_OUTER = 135;
const LABEL_INNER = 30;
const HUB_RADIUS = 14;
const RIM_WIDTH = 2.5;
const BASE_LABEL = 19;
const POINTER_HEIGHT = 26;
const POINTER_HALF = 13;
const POINTER_GAP = 6;
// Artboard: the wheel plus the pointer above it
const ART_WIDTH = ART_RADIUS * 2;
const ART_HEIGHT = ART_RADIUS * 2 + POINTER_HEIGHT + POINTER_GAP;

const LABEL_FONT = '"Roboto", "Google Sans", "Segoe UI", sans-serif';

class WheelRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.items = [];
        this.colors = null;
        this.colorStyle = 'Classic';
        this.textDisplayMode = 'Auto';
        this.textSize = 'Medium';
        this.rotation = -90;
        this.highlightIndex = null;
        this.layoutCache = null;
        this.width = 0;
        this.height = 0;
    }

    updateState(state) {
        if (state.items !== undefined) this.items = Array.isArray(state.items) ? state.items : [];
        // Absent on v2 phones: fall back to the legacy palettes
        this.colors = Array.isArray(state.colors) && state.colors.length > 0 ? state.colors : null;
        if (state.colorStyle !== undefined) this.colorStyle = state.colorStyle;
        if (state.textDisplayMode !== undefined) this.textDisplayMode = state.textDisplayMode;
        if (state.textSize !== undefined) this.textSize = state.textSize;
        if (typeof state.rotation === 'number' && isFinite(state.rotation)) this.rotation = state.rotation;
        if (this.highlightIndex !== null && this.highlightIndex >= this.items.length) this.highlightIndex = null;
    }

    setRotation(rotation) {
        this.rotation = rotation;
    }

    setHighlight(index) {
        this.highlightIndex = (typeof index === 'number' && index >= 0 && index < this.items.length) ? index : null;
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.width = rect.width;
        this.height = rect.height;
        this.canvas.width = Math.round(rect.width * dpr);
        this.canvas.height = Math.round(rect.height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    sliceColor(index) {
        if (this.colors) return this.colors[index % this.colors.length];
        const palette = LEGACY_PALETTES[this.colorStyle] || LEGACY_PALETTES.Classic;
        return palette[index % palette.length];
    }

    labelScale() {
        switch (this.textSize) {
            case 'Small': return 0.82;
            case 'Large': return 1.2;
            default: return 1;
        }
    }

    render() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        ctx.clearRect(0, 0, w, h);
        if (w === 0 || h === 0) return;

        const unit = Math.min(w / ART_WIDTH, h / ART_HEIGHT);
        const radius = ART_RADIUS * unit;
        const top = (h - ART_HEIGHT * unit) / 2;
        const cx = w / 2;
        const cy = top + (POINTER_HEIGHT + POINTER_GAP) * unit + radius;
        const pointerTip = cy - radius - POINTER_GAP * unit;

        if (this.items.length === 0) {
            this.renderPlaceholder(ctx, cx, cy, radius, unit);
            this.renderPointer(ctx, cx, pointerTip, unit, THEME.outlineVariant, null);
            return;
        }

        const count = this.items.length;
        const sweep = 360 / count;
        const highlight = this.highlightIndex;
        const colors = [];
        for (let i = 0; i < count; i++) {
            const c = this.sliceColor(i);
            // Dimmed slices blend toward the surface, like the app's result state
            colors.push(highlight !== null && i !== highlight ? mixHex(c, THEME.surface, 0.5) : c);
        }

        for (let i = 0; i < count; i++) {
            this.wedge(ctx, cx, cy, radius, this.rotation + i * sweep, sweep);
            ctx.fillStyle = colors[i];
            ctx.fill();
        }

        // Slice separators in the surface colour
        if (count > 1) {
            ctx.strokeStyle = THEME.surface;
            ctx.lineWidth = 2 * unit;
            for (let i = 0; i < count; i++) {
                const a = toRad(this.rotation + i * sweep);
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
                ctx.stroke();
            }
        }

        if (highlight !== null) {
            this.wedge(ctx, cx, cy, radius, this.rotation + highlight * sweep, sweep);
            ctx.strokeStyle = THEME.onSurface;
            ctx.lineWidth = 3 * unit;
            ctx.lineJoin = 'round';
            ctx.stroke();
        }

        this.renderLabels(ctx, cx, cy, unit, sweep, colors);
        this.renderRimAndHub(ctx, cx, cy, radius, unit, THEME.onSurfaceVariant);
        this.renderPointer(ctx, cx, pointerTip, unit, THEME.primary, THEME.surface);
    }

    wedge(ctx, cx, cy, radius, startDeg, sweepDeg) {
        const start = toRad(startDeg);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, start, start + toRad(sweepDeg));
        ctx.closePath();
    }

    /**
     * Font size and fitted text for every label. Measuring is slow, so this is cached and only
     * redone when the wheel, the label settings or the canvas size change.
     */
    labelLayout(ctx, unit, sweep) {
        const key = [this.width, this.height, this.textSize, this.textDisplayMode,
            this.items.map((item) => item.label).join('\u0000')].join('|');
        if (this.layoutCache && this.layoutCache.key === key) return this.layoutCache;

        const count = this.items.length;
        const layout = { key, fontPx: 0, labels: [] };
        this.layoutCache = layout;
        if (this.textDisplayMode === 'Minimal' || count === 0) return layout;

        const labels = this.items.map((item) => {
            const label = String(item.label || '');
            return this.textDisplayMode === 'Truncated' && label.length > 8 ? label.substring(0, 7) + '…' : label;
        });
        // Font size is capped by how thick the slice is where the label sits
        const halfSin = Math.sin(toRad(sweep / 2));
        const thickness = count <= 1 ? Infinity : 2 * 100 * unit * halfSin * 0.85;
        const minFont = 8 * unit;
        let fontPx = Math.min(BASE_LABEL * this.labelScale() * unit, thickness);
        // Too-thin slices get no labels rather than unreadable ones
        if (fontPx < minFont) return layout;

        // Labels stop where the slice gets thinner than the text, so neighbours never overlap
        const maxWidthFor = (f) => count <= 2
            ? (LABEL_OUTER - LABEL_INNER) * unit
            : Math.max(0, LABEL_OUTER * unit - Math.max(LABEL_INNER * unit, f / (2 * halfSin)));
        // Shrink (down to the minimum) until the typical label fits; unusually long ones ellipsize.
        // Text width scales with font size, so each label is measured once.
        ctx.font = `600 ${fontPx}px ${LABEL_FONT}`;
        const widths = labels.map((label) => ctx.measureText(label).width).sort((a, b) => a - b);
        const typical = widths[Math.floor((widths.length - 1) / 2)];
        const base = fontPx;
        while (fontPx > minFont && typical * (fontPx / base) > maxWidthFor(fontPx)) {
            fontPx = Math.max(minFont, fontPx * 0.92);
        }

        ctx.font = `600 ${fontPx}px ${LABEL_FONT}`;
        const maxWidth = maxWidthFor(fontPx);
        layout.fontPx = fontPx;
        layout.labels = labels.map((label) => fitText(ctx, label, maxWidth));
        return layout;
    }

    renderLabels(ctx, cx, cy, unit, sweep, colors) {
        const layout = this.labelLayout(ctx, unit, sweep);
        if (!layout.fontPx) return;

        ctx.font = `600 ${layout.fontPx}px ${LABEL_FONT}`;
        ctx.textBaseline = 'middle';

        layout.labels.forEach((label, i) => {
            if (!label.trim()) return;
            const mid = this.rotation + i * sweep + sweep / 2;
            const norm = ((mid % 360) + 360) % 360;
            const rightHalf = norm < 90 || norm >= 270;
            const dimmed = this.highlightIndex !== null && i !== this.highlightIndex;

            ctx.save();
            ctx.translate(cx, cy);
            // Left-half labels are flipped so they never read upside down
            ctx.rotate(toRad(rightHalf ? mid : mid + 180));
            ctx.globalAlpha = dimmed ? 0.75 : 1;
            ctx.fillStyle = labelColorOn(colors[i]);
            ctx.textAlign = rightHalf ? 'right' : 'left';
            ctx.fillText(label, rightHalf ? LABEL_OUTER * unit : -LABEL_OUTER * unit, 0);
            ctx.restore();
        });
    }

    renderRimAndHub(ctx, cx, cy, radius, unit, rimColor) {
        ctx.strokeStyle = rimColor;
        ctx.lineWidth = RIM_WIDTH * unit;
        ctx.beginPath();
        ctx.arc(cx, cy, radius - (RIM_WIDTH * unit) / 2, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, HUB_RADIUS * unit, 0, 2 * Math.PI);
        ctx.fillStyle = THEME.surface;
        ctx.fill();
        ctx.stroke();
    }

    renderPointer(ctx, cx, tipY, unit, fill, outline) {
        const baseY = tipY - POINTER_HEIGHT * unit;
        const half = POINTER_HALF * unit;
        ctx.beginPath();
        ctx.moveTo(cx, tipY);
        ctx.lineTo(cx + half, baseY);
        ctx.lineTo(cx - half, baseY);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        if (outline) {
            ctx.strokeStyle = outline;
            ctx.lineWidth = 2 * unit;
            ctx.lineJoin = 'round';
            ctx.stroke();
        }
    }

    /** Muted four-slice wheel shown while waiting for the phone. */
    renderPlaceholder(ctx, cx, cy, radius, unit) {
        const colors = ['#FFE66D', '#4ECDC4', '#FF8B94', '#95E1D3'];
        for (let i = 0; i < colors.length; i++) {
            this.wedge(ctx, cx, cy, radius, -90 + i * 90, 90);
            ctx.fillStyle = mixHex(colors[i], THEME.surface, 0.72);
            ctx.fill();
        }
        this.renderRimAndHub(ctx, cx, cy, radius, unit, THEME.outlineVariant);
    }
}

function toRad(deg) {
    return (deg * Math.PI) / 180;
}

/** Shortens text with an ellipsis until it fits [maxWidth] in the current font. */
function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (ctx.measureText(text.slice(0, mid).trimEnd() + '…').width <= maxWidth) lo = mid;
        else hi = mid - 1;
    }
    return lo === 0 ? '' : text.slice(0, lo).trimEnd() + '…';
}

function parseHex(hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 8) h = h.slice(2); // #AARRGGBB, as Android formats it
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    if (h.length !== 6 || isNaN(n)) return [128, 128, 128];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb) {
    return '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** Linear blend of two colours; t = 0 is [a], 1 is [b]. */
function mixHex(a, b, t) {
    const x = parseHex(a);
    const y = parseHex(b);
    return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

/** Dark ink on light slices, white on dark ones (same threshold as the app). */
function labelColorOn(hex) {
    const lin = parseHex(hex).map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    const luminance = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    return luminance > 0.36 ? '#201A19' : '#FFFFFF';
}
