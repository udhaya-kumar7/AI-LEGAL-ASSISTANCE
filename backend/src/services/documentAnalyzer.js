import axios from 'axios';

const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';

const DOCUMENT_ANALYSIS_PROMPT = `You are an expert LEGAL DOCUMENT ANALYST. Analyze the provided document thoroughly and:

1. **Document Type**: Identify what type of legal document this is (contract, agreement, notice, petition, etc.)

2. **Key Provisions**: Summarize the main legal provisions, clauses, or terms

3. **Legal Compliance**: Check for missing clauses, ambiguous language, potential issues, non-standard provisions

4. **Risk Assessment**: Identify high-risk clauses, obligations, liabilities, rights that may be waived

5. **Recommendations**: Provide specific guidance on corrections needed, missing elements, lawyer review items

Be thorough, clear, and practical. Focus on actionable insights.`;

/**
 * Analyze a legal document (text, image, or PDF)
 * @param {Object} file - Multer file object with buffer
 * @returns {Promise<Object>} Analysis result
 */
export async function analyzeDocument(file) {
  try {
    let documentText = null;
    let imageBase64 = null;
    let mimeType = file.mimetype;

    // Handle text files
    if (file.mimetype === 'text/plain' || file.originalname.endsWith('.txt')) {
      documentText = file.buffer.toString('utf-8');
      
      if (!documentText || documentText.trim().length < 50) {
        return {
          error: 'Document text is too short. Please upload a document with at least 50 characters.',
          success: false
        };
      }
    }
    // Handle image files - convert to base64
    else if (file.mimetype.startsWith('image/')) {
      imageBase64 = file.buffer.toString('base64');
    }
    // Handle PDF files
    else if (file.mimetype === 'application/pdf') {
      return {
        error: 'PDFs not yet supported. Please:\n1. Open your PDF in Google Drive\n2. Download as image or copy text\n3. Upload image or paste text',
        success: false
      };
    }
    // Unsupported
    else {
      return {
        error: 'Please upload an image (.jpg, .png), text file (.txt), or paste text in chat.',
        success: false
      };
    }

    let analysis = '';

    if (imageBase64) {
      // Use Gemini 2.5 Flash for image/vision document analysis
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not defined in environment variables');
      }

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      
      const response = await axios.post(
        geminiUrl,
        {
          contents: [
            {
              parts: [
                { text: DOCUMENT_ANALYSIS_PROMPT },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: imageBase64
                  }
                }
              ]
            }
          ]
        },
        { timeout: 120000 }
      );

      analysis = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis generated';
    } else {
      // Text analysis using Grok API
      const messages = [
        { role: 'system', content: DOCUMENT_ANALYSIS_PROMPT },
        { role: 'user', content: `Analyze this legal document:\n\n${documentText}` }
      ];

      const response = await axios.post(
        XAI_API_URL,
        {
          model: 'grok-beta',
          messages,
          stream: false,
          temperature: 0.2,
          max_tokens: 1500
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 120000
        }
      );

      analysis = response.data?.choices?.[0]?.message?.content || 'No analysis generated';
    }

    return {
      success: true,
      analysis,
      documentType: file.mimetype,
      fileName: file.originalname,
      fileSize: file.size
    };

  } catch (error) {
    console.error('[Document Analyzer] Error:', error.message);
    throw new Error(`Document analysis failed: ${error.message}`);
  }
}
