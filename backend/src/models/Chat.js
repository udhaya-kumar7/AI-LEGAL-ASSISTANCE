import mongoose from 'mongoose';

const ChatSchema = new mongoose.Schema({
  title: { type: String, default: 'New chat' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

export const Chat = mongoose.model('Chat', ChatSchema);
