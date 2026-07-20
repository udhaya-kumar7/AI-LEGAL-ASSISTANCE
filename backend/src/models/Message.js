import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
  role: { type: String, enum: ['user','ai'], required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

export const Message = mongoose.model('Message', MessageSchema);
