/**
 * La Ruletita Cast Receiver - Wheel Renderer
 * HTML5 Canvas port of WheelCanvas.kt and Pointer.kt
 */

const COLOR_PALETTES = {
    Classic: ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#FF8B94', '#A8E6CF', '#FFAA85', '#9D84B7'],
    Vibrant: ['#FF1744', '#00E676', '#FFEA00', '#00B0FF', '#FF9100', '#D500F9', '#1DE9B6', '#FF4081'],
    Pastel: ['#FFB5BA', '#B5DEFF', '#FFF6B5', '#B5FFCD', '#E0B5FF', '#FFD9B5', '#B5FFF6', '#FFC8DD'],
    Monochrome: ['#FF6348', '#FF8A70', '#E55039', '#FFB099', '#CC4125', '#FFD4C2', '#B33620', '#FF7F5E']
};

const ACCENT_GOLD = '#FFD700';
const ACCENT_ORANGE = '#FF6348';
const POINTER_RED = '#E74C3C';

class WheelRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.items = [];
        this.colorStyle = 'Classic';
        this.textDisplayMode = 'Auto';
        this.textSize = 'Medium';
        this.rotation = 0;
        this.dpr = window.devicePixelRatio || 1;
    }

    updateState(state) {
        if (state.items !== undefined) this.items = state.items;
        if (state.colorStyle !== undefined) this.colorStyle = state.colorStyle;
        if (state.textDisplayMode !== undefined) this.textDisplayMode = state.textDisplayMode;
        if (state.textSize !== undefined) this.textSize = state.textSize;
        if (state.rotation !== undefined) this.rotation = state.rotation;
    }

    setRotation(rotation) {
        this.rotation = rotation;
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * this.dpr;
        this.canvas.height = rect.height * this.dpr;
        this.ctx.scale(this.dpr, this.dpr);
    }

    getTextSizePx(radius) {
        const baseSize = radius * 0.07;
        switch (this.textSize) {
            case 'Small': return baseSize * 0.78;
            case 'Large': return baseSize * 1.28;
            default: return baseSize; // Medium
        }
    }

    getEffectiveDisplayMode() {
        if (this.textDisplayMode !== 'Auto') return this.textDisplayMode;
        const count = this.items.length;
        if (count <= 8) return 'Full';
        if (count <= 15) return 'Truncated';
        return 'Minimal';
    }

    formatText(text, mode) {
        switch (mode) {
            case 'Full': return text;
            case 'Truncated': return text.length > 8 ? text.substring(0, 7) + '\u2026' : text;
            case 'Minimal': return '';
            default: return text;
        }
    }

    render() {
        const ctx = this.ctx;
        const width = this.canvas.width / this.dpr;
        const height = this.canvas.height / this.dpr;

        ctx.clearRect(0, 0, width, height);

        if (this.items.length === 0) {
            this.renderWaitingState(ctx, width, height);
            return;
        }

        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.4;
        const sliceAngle = (2 * Math.PI) / this.items.length;
        const colors = COLOR_PALETTES[this.colorStyle] || COLOR_PALETTES.Classic;
        const rotationRad = (this.rotation * Math.PI) / 180;
        const effectiveMode = this.getEffectiveDisplayMode();
        const showText = effectiveMode !== 'Minimal';
        const fontSize = this.getTextSizePx(radius);

        // Draw outer shadow
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX + 2, centerY + 4, radius + 4, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fill();
        ctx.restore();

        // Draw slices
        for (let i = 0; i < this.items.length; i++) {
            const startAngle = rotationRad + i * sliceAngle;
            const endAngle = startAngle + sliceAngle;
            const color = colors[i % colors.length];

            // Create radial gradient
            const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
            gradient.addColorStop(0, color);
            gradient.addColorStop(1, this.colorWithAlpha(color, 0.8));

            // Draw slice
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();

            // Draw slice border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw text
            if (showText) {
                const midAngle = startAngle + sliceAngle / 2;
                const textRadius = radius * 0.65;
                const textX = centerX + textRadius * Math.cos(midAngle);
                const textY = centerY + textRadius * Math.sin(midAngle);
                const label = this.formatText(this.items[i].label, effectiveMode);

                if (label) {
                    ctx.save();
                    ctx.translate(textX, textY);
                    ctx.rotate(midAngle + Math.PI / 2);

                    ctx.font = `bold ${fontSize}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    // Text shadow
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                    ctx.fillText(label, 1, 1);

                    // Text
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillText(label, 0, 0);

                    ctx.restore();
                }
            }
        }

        // Outer gold rim
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = ACCENT_GOLD;
        ctx.lineWidth = 6;
        ctx.stroke();

        // Inner gold rim
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius - 6, 0, 2 * Math.PI);
        ctx.strokeStyle = this.colorWithAlpha(ACCENT_GOLD, 0.5);
        ctx.lineWidth = 2;
        ctx.stroke();

        // Center circle with gradient
        const centerRadius = radius * 0.1;
        const centerGradient = ctx.createRadialGradient(
            centerX, centerY, 0, centerX, centerY, centerRadius
        );
        centerGradient.addColorStop(0, ACCENT_GOLD);
        centerGradient.addColorStop(1, ACCENT_ORANGE);

        ctx.beginPath();
        ctx.arc(centerX, centerY, centerRadius, 0, 2 * Math.PI);
        ctx.fillStyle = centerGradient;
        ctx.fill();

        // Center white dot
        const dotRadius = centerRadius * 0.27;
        ctx.beginPath();
        ctx.arc(centerX, centerY, dotRadius, 0, 2 * Math.PI);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();

        // Draw pointer
        this.renderPointer(ctx, centerX, centerY, radius);
    }

    renderPointer(ctx, centerX, centerY, radius) {
        const pointerHeight = radius * 0.35;
        const pointerWidth = radius * 0.08;
        const pointerTop = centerY - radius - 6; // Just outside the rim

        // Shadow
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(centerX + 2, pointerTop + pointerHeight + 2);
        ctx.lineTo(centerX - pointerWidth / 2 + 2, pointerTop + 2);
        ctx.lineTo(centerX + pointerWidth / 2 + 2, pointerTop + 2);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fill();
        ctx.restore();

        // Main pointer triangle
        ctx.beginPath();
        ctx.moveTo(centerX, pointerTop + pointerHeight);
        ctx.lineTo(centerX - pointerWidth / 2, pointerTop);
        ctx.lineTo(centerX + pointerWidth / 2, pointerTop);
        ctx.closePath();
        ctx.fillStyle = POINTER_RED;
        ctx.fill();

        // Gold outline
        ctx.strokeStyle = ACCENT_GOLD;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Decorative circle at tip
        ctx.beginPath();
        ctx.arc(centerX, pointerTop, pointerWidth * 0.25, 0, 2 * Math.PI);
        ctx.fillStyle = ACCENT_GOLD;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(centerX, pointerTop, pointerWidth * 0.125, 0, 2 * Math.PI);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
    }

    renderWaitingState(ctx, width, height) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Waiting for wheel data...', width / 2, height / 2);
    }

    /**
     * Convert hex color to rgba with given alpha.
     */
    colorWithAlpha(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}
