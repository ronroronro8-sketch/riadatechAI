import mongoose from "mongoose";

const BusinessMemorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "userInfos", required: true, immutable: true },
  key: { type: String, required: true, maxlength: 100 },
  // Preserve the user's wording, numbers and units, without conversion or inference.
  value: { type: String, required: true, maxlength: 400 },
  sourceConversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
  sourceMessageId: { type: mongoose.Schema.Types.ObjectId, ref: "ConversationMessage", required: true },
  sourceCreatedAt: { type: Date, required: true },
}, { timestamps: true });
BusinessMemorySchema.index({ userId: 1, key: 1 }, { unique: true });

export default mongoose.model("BusinessMemory", BusinessMemorySchema);
