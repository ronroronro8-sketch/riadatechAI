import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  conversationId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  revision: { type: Number, required: true },
  requestId: { type: String, required: true },
  sequence: { type: Number, required: true },
  inputs: { type: mongoose.Schema.Types.Mixed, default: {} },
  calculations: { type: mongoose.Schema.Types.Mixed, default: {} },
  sources: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true });
schema.index({ userId: 1, conversationId: 1 }, { unique: true });
export default mongoose.model('FeasibilityStudy', schema);
