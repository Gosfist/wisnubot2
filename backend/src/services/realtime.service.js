class RealtimeService {
  constructor() {
    this.io = null;
  }

  setIO(io) {
    this.io = io;
  }

  emitTrxGeminiChanged(userId, payload = {}) {
    const id = Number(userId);
    if (!this.io || !id) return;
    this.io.to(`user_${id}`).emit("trx_gemini_changed", {
      userId: id,
      changedAt: new Date().toISOString(),
      ...payload,
    });
  }
}

export const realtimeService = new RealtimeService();
