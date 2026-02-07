/**
 * La Ruletita Cast Receiver
 * Handles Cast SDK initialization, message routing, and animation state machine.
 */

const NAMESPACE = 'urn:x-cast:com.xeroxislabz.laruletita';

// State machine states
const State = {
    IDLE: 'IDLE',
    SPINNING: 'SPINNING',
    SHOWING_WINNER: 'SHOWING_WINNER'
};

class LaRuletitaReceiver {
    constructor() {
        this.state = State.IDLE;
        this.canvas = document.getElementById('wheel-canvas');
        this.winnerOverlay = document.getElementById('winner-overlay');
        this.winnerLabel = document.getElementById('winner-label');
        this.statusText = document.getElementById('status-text');

        this.renderer = new WheelRenderer(this.canvas);
        this.animationId = null;
        this.spinAnimation = null;
        this.winnerTimeout = null;

        this.setupCanvas();
        this.initCastReceiver();

        window.addEventListener('resize', () => this.setupCanvas());
    }

    setupCanvas() {
        this.renderer.resize();
        this.renderer.render();
    }

    initCastReceiver() {
        const context = cast.framework.CastReceiverContext.getInstance();

        // Set up custom message listener
        context.addCustomMessageListener(NAMESPACE, (event) => {
            this.handleMessage(event.data);
        });

        // Start the receiver
        const options = new cast.framework.CastReceiverOptions();
        options.disableIdleTimeout = true;
        context.start(options);

        // Send RECEIVER_READY to the sender
        setTimeout(() => {
            this.sendMessage({ type: 'RECEIVER_READY', payload: {} });
        }, 500);
    }

    sendMessage(message) {
        try {
            const context = cast.framework.CastReceiverContext.getInstance();
            context.sendCustomMessage(NAMESPACE, undefined, message);
        } catch (e) {
            console.error('Failed to send message:', e);
        }
    }

    handleMessage(data) {
        let msg;
        if (typeof data === 'string') {
            try { msg = JSON.parse(data); } catch (e) {
                console.error('Invalid JSON message:', data);
                return;
            }
        } else {
            msg = data;
        }

        console.log('Received message:', msg.type);

        switch (msg.type) {
            case 'WHEEL_STATE':
                this.handleWheelState(msg.payload);
                break;
            case 'SPIN_START':
                this.handleSpinStart(msg.payload);
                break;
            case 'ROTATION_UPDATE':
                this.handleRotationUpdate(msg.payload);
                break;
            case 'SPIN_END':
                this.handleSpinEnd(msg.payload);
                break;
            case 'WINNER_DISMISS':
                this.handleWinnerDismiss();
                break;
        }
    }

    handleWheelState(payload) {
        this.renderer.updateState({
            items: payload.items,
            colorStyle: payload.colorStyle,
            textDisplayMode: payload.textDisplayMode,
            textSize: payload.textSize,
            rotation: payload.rotation
        });

        // Hide status text once we have data
        if (this.statusText) {
            this.statusText.style.display = 'none';
        }

        // Re-render if not currently spinning
        if (this.state !== State.SPINNING) {
            this.renderer.render();
        }
    }

    handleSpinStart(payload) {
        this.state = State.SPINNING;

        // Cancel any existing animation
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        const startRotation = this.renderer.rotation;
        const targetRotation = payload.targetRotation;
        const totalDistance = targetRotation - startRotation;
        const durationMs = payload.durationMs;

        // Two-phase animation:
        // Phase 1 (70% of distance): Linear easing over durationMs
        // Phase 2 (30% of distance): EaseOutCubic over 1500ms
        const phase1Distance = totalDistance * 0.7;
        const phase2Distance = totalDistance * 0.3;
        const phase1Duration = durationMs;
        const phase2Duration = 1500;
        const totalDuration = phase1Duration + phase2Duration;

        this.spinAnimation = {
            startRotation,
            targetRotation,
            phase1Distance,
            phase2Distance,
            phase1Duration,
            phase2Duration,
            totalDuration,
            startTime: performance.now(),
            correctionTarget: null
        };

        this.animateSpin();
    }

    animateSpin() {
        const anim = this.spinAnimation;
        if (!anim) return;

        const now = performance.now();
        const elapsed = now - anim.startTime;

        let rotation;
        if (elapsed < anim.phase1Duration) {
            // Phase 1: Linear
            const progress = elapsed / anim.phase1Duration;
            rotation = anim.startRotation + anim.phase1Distance * progress;
        } else if (elapsed < anim.totalDuration) {
            // Phase 2: EaseOutCubic
            const phase2Elapsed = elapsed - anim.phase1Duration;
            const progress = phase2Elapsed / anim.phase2Duration;
            const eased = 1 - Math.pow(1 - progress, 3);
            rotation = anim.startRotation + anim.phase1Distance + anim.phase2Distance * eased;
        } else {
            // Animation complete
            rotation = anim.targetRotation;
            this.renderer.setRotation(rotation);
            this.renderer.render();
            this.spinAnimation = null;
            this.animationId = null;
            return;
        }

        // Apply correction blending if we have a correction target
        if (anim.correctionTarget !== null) {
            const diff = anim.correctionTarget - rotation;
            if (Math.abs(diff) > 5) {
                // Blend toward correction (smooth, not jarring)
                rotation += diff * 0.1;
            }
            // Clear correction after applying
            if (Math.abs(diff) < 2) {
                anim.correctionTarget = null;
            }
        }

        this.renderer.setRotation(rotation);
        this.renderer.render();

        this.animationId = requestAnimationFrame(() => this.animateSpin());
    }

    handleRotationUpdate(payload) {
        if (this.state !== State.SPINNING || !this.spinAnimation) return;

        // Store correction target for smooth blending
        this.spinAnimation.correctionTarget = payload.rotation;
    }

    handleSpinEnd(payload) {
        // Cancel any running animation
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.spinAnimation = null;

        // Snap to final rotation
        this.renderer.setRotation(payload.finalRotation);
        this.renderer.render();

        // Show winner after a brief pause
        setTimeout(() => {
            this.showWinner(payload.winnerLabel);
        }, 200);
    }

    showWinner(label) {
        this.state = State.SHOWING_WINNER;

        if (this.winnerLabel) {
            this.winnerLabel.textContent = label;
        }
        if (this.winnerOverlay) {
            this.winnerOverlay.classList.add('visible');
        }

        // Auto-dismiss after 30 seconds (in case phone disconnects)
        this.winnerTimeout = setTimeout(() => {
            this.handleWinnerDismiss();
        }, 30000);
    }

    handleWinnerDismiss() {
        if (this.winnerTimeout) {
            clearTimeout(this.winnerTimeout);
            this.winnerTimeout = null;
        }

        if (this.winnerOverlay) {
            this.winnerOverlay.classList.remove('visible');
        }

        this.state = State.IDLE;
    }
}

// Initialize when the page loads
window.addEventListener('load', () => {
    window.receiver = new LaRuletitaReceiver();
});
