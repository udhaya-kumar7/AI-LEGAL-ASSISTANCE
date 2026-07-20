import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../models/User.js';

const router = Router();
const client = new OAuth2Client();

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '30d' });
};

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Please add all fields' });

    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ error: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({ name, email, password: hashedPassword });
    if (user) {
      res.status(201).json({ _id: user.id, name: user.name, email: user.email, token: generateToken(user._id) });
    } else {
      res.status(400).json({ error: 'Invalid user data' });
    }
  } catch (err) { next(err); }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && user.password && (await bcrypt.compare(password, user.password))) {
      res.json({ _id: user.id, name: user.name, email: user.email, token: generateToken(user._id) });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (err) { next(err); }
});

// POST /api/auth/google
router.post('/google', async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Missing credential' });

    // Verify token with google
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: (process.env.GOOGLE_CLIENT_ID || 'placeholder_client_id').trim()
    });
    const payload = ticket.getPayload();

    const { email, name, sub: googleId } = payload;
    let user = await User.findOne({ email });

    if (user) {
      if (!user.googleId) {
        user.googleId = googleId;
        await user.save();
      }
      res.json({ _id: user.id, name: user.name, email: user.email, token: generateToken(user._id) });
    } else {
      user = await User.create({ name, email, googleId });
      res.status(201).json({ _id: user.id, name: user.name, email: user.email, token: generateToken(user._id) });
    }
  } catch (err) {
    // Decode the JWT to see what the audience actually is
    const tokenParts = req.body.credential ? req.body.credential.split('.') : [];
    if (tokenParts.length === 3) {
      try {
        const payloadStr = Buffer.from(tokenParts[1], 'base64').toString();
        const payloadObj = JSON.parse(payloadStr);
        console.error('---- GOOGLE AUTH DEBUG ----');
        console.error('Expected Audience:', (process.env.GOOGLE_CLIENT_ID || 'placeholder_client_id').trim());
        console.error('Actual Token Audience (aud):', payloadObj.aud);
        console.error('---------------------------');
      } catch (e) {}
    }
    console.error('Google Auth Error:', err.message);
    res.status(401).json({ error: 'Google authentication failed' });
  }
});

export default router;
