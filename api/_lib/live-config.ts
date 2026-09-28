import { Modality, Type, type FunctionDeclaration, type LiveConnectConfig } from '@google/genai';
import { VOICE } from './gemini.js';

/**
 * Everything that shapes the assistant's behaviour lives on the server and is
 * baked into the ephemeral token. The browser can't swap the prompt, tools or
 * model, so a leaked token is only good for talking to this assistant.
 */

const SYSTEM_INSTRUCTION = `
You are Covered, a live voice assistant for insurance policyholders in India. People call you to report a claim or to understand what their policy actually says. You are warm, calm and precise, like the best claims officer they have ever spoken to.

HOW YOU SPEAK
- This is a spoken conversation. Keep each turn short: one to three sentences, then stop and let the caller talk.
- Use plain words. No lists, no markdown, no long strings of clause numbers. Explain what a clause means instead of reading it out.
- Reply in the language the caller uses (English, Hindi, Hinglish, Marathi or any other) and switch when they switch.
- Amounts are in Indian rupees. Say them naturally, for example "two lakh forty thousand rupees".
- If the caller interrupts you, stop and respond to what they just said. Do not restart your previous answer.

GROUNDING IN THE POLICY DOCUMENT
- The caller may share their screen with their policy document on it. Treat what you can read on screen as the source of truth.
- Before you tell the caller what their policy says, find the clause on screen and call cite_clause with its number and the exact words from the document. Quote only what you can actually read. Never invent clause numbers, limits or wording.
- If the part you need is not visible, say so and ask the caller to scroll to it, for example "Could you scroll down to the exclusions?".
- If no document is shared, you may explain how such policies usually work, but say clearly that their own policy wording decides it, and invite them to share it on screen.
- You give guidance, not a claim decision. When something depends on the insurer's assessment, say so.

TAKING A CLAIM
- As soon as the caller mentions a claim detail, record it with update_claim. Do not wait for the end of the call and do not ask again for details you already have. Details printed on the shared policy (policy number, insurer, policyholder) can be recorded directly from the screen.
- The update_claim reply lists what is still missing. Ask for the most useful missing detail next, one question at a time, woven naturally into the conversation.
- When you know enough to judge, call assess_coverage with your verdict, the reasons and the clauses you relied on.
- Never do arithmetic yourself. For any payable amount, deduction, co-payment, depreciation or room-rent calculation, call estimate_payout and read the result back simply.
- Before the conversation wraps up, call set_next_steps with what the caller should do next and which documents they will need, then sum up in two or three sentences.

SAFETY AND PRIVACY
- Never ask for Aadhaar, PAN, bank account or card numbers, OTPs or passwords. If the caller reads one out, do not repeat it and do not record it.
- If someone describes a medical emergency happening right now, tell them to call 112 or go to the nearest hospital first. The claim can wait.
- Never promise that a claim will be approved.

APP EVENTS
Text in square brackets, like [call connected] or [screen shared], comes from the app, not from the caller.
- [call connected]: greet the caller in one short sentence and ask what happened or what they would like to know.
- [screen shared]: in one sentence, say what document you can see, if any.
- [screen stopped]: you can no longer see their screen. Mention it only if it matters for the conversation.
`.trim();

const updateClaim: FunctionDeclaration = {
  name: 'update_claim',
  description:
    'Record or correct details of the caller\'s claim the moment they are mentioned. Send only the fields you just learned or that changed. Returns the full claim file and the fields still missing.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      claim_type: { type: Type.STRING, enum: ['health', 'motor', 'home', 'travel', 'life', 'other'] },
      policy_number: { type: Type.STRING },
      insurer: { type: Type.STRING },
      policy_name: { type: Type.STRING, description: 'Product name printed on the policy.' },
      policyholder: { type: Type.STRING, description: 'Name of the person who holds the policy.' },
      patient_or_driver: { type: Type.STRING, description: 'Who was treated or who was driving, if different from the policyholder.' },
      incident_date: { type: Type.STRING, description: 'Date of the incident or hospital admission, as YYYY-MM-DD when possible.' },
      incident_summary: { type: Type.STRING, description: 'One or two plain sentences on what happened.' },
      location: { type: Type.STRING, description: 'Hospital, garage or place of the incident.' },
      claim_amount: { type: Type.NUMBER, description: 'Amount billed or estimated, in rupees.' },
      claim_route: { type: Type.STRING, enum: ['cashless', 'reimbursement', 'unknown'] },
      insurer_informed: { type: Type.BOOLEAN, description: 'Whether the insurer has already been told about the claim.' },
    },
  },
};

const citeClause: FunctionDeclaration = {
  name: 'cite_clause',
  description:
    'Pin a clause from the policy document on the caller\'s screen before explaining it. The quote must be copied from what is visible, never paraphrased or invented.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      clause_ref: { type: Type.STRING, description: 'Clause or section number exactly as printed, e.g. "3.6" or "Section II(b)".' },
      title: { type: Type.STRING, description: 'Short heading of the clause.' },
      quote: { type: Type.STRING, description: 'The exact words from the document, at most about 60 words.' },
      meaning: { type: Type.STRING, description: 'What this means for this caller, in one plain sentence.' },
      effect: {
        type: Type.STRING,
        enum: ['supports', 'limits', 'excludes', 'procedure', 'neutral'],
        description: 'How the clause affects the caller\'s claim or question.',
      },
    },
    required: ['clause_ref', 'quote', 'meaning'],
  },
};

const assessCoverage: FunctionDeclaration = {
  name: 'assess_coverage',
  description: 'Record your current view on whether the claim is covered, with reasons and the clauses relied on. Call again if the picture changes.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      verdict: { type: Type.STRING, enum: ['likely_covered', 'partly_covered', 'likely_not_covered', 'need_more_info'] },
      summary: { type: Type.STRING, description: 'One sentence the caller would understand.' },
      reasons: { type: Type.ARRAY, items: { type: Type.STRING } },
      clause_refs: { type: Type.ARRAY, items: { type: Type.STRING } },
      confidence: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
    },
    required: ['verdict', 'summary'],
  },
};

const estimatePayout: FunctionDeclaration = {
  name: 'estimate_payout',
  description:
    'Calculate the likely payable amount exactly. List adjustments in the order the policy applies them: non-payable items first, then proportionate deductions, depreciation, deductibles, co-payment, and finally caps such as the sum insured. Returns the breakdown to read back.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      claimed_amount: { type: Type.NUMBER, description: 'Total bill or repair estimate in rupees.' },
      adjustments: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            label: { type: Type.STRING, description: 'e.g. "Non-payable items", "Room rent proportionate deduction", "Co-payment".' },
            kind: {
              type: Type.STRING,
              enum: ['deduct_fixed', 'deduct_percent', 'proportionate', 'cap'],
              description:
                'deduct_fixed: subtract value rupees. deduct_percent: subtract value percent of the running amount (or of applies_to). proportionate: pay only value/actual of applies_to. cap: limit the running amount to value.',
            },
            value: { type: Type.NUMBER },
            actual: { type: Type.NUMBER, description: 'For proportionate only: the amount actually charged, e.g. actual room rent per day.' },
            applies_to: { type: Type.NUMBER, description: 'Optional: the rupee amount this adjustment applies to, if not the whole running amount.' },
            clause_ref: { type: Type.STRING },
          },
          required: ['label', 'kind', 'value'],
        },
      },
      note: { type: Type.STRING, description: 'Any assumption the caller should know about.' },
    },
    required: ['claimed_amount'],
  },
};

const setNextSteps: FunctionDeclaration = {
  name: 'set_next_steps',
  description: 'Give the caller a short, ordered plan and the documents they will need, based on the policy\'s claim procedure.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      steps: { type: Type.ARRAY, items: { type: Type.STRING } },
      documents: { type: Type.ARRAY, items: { type: Type.STRING } },
      deadline: { type: Type.STRING, description: 'Any time limit from the policy, with its clause number.' },
    },
    required: ['steps'],
  },
};

export function buildLiveConfig(resumeHandle?: string): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: SYSTEM_INSTRUCTION,
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } },
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    tools: [{ functionDeclarations: [updateClaim, citeClause, assessCoverage, estimatePayout, setNextSteps] }],
    // Audio + video sessions are capped at ~2 minutes without compression.
    // A sliding window lets a caller keep a document on screen for as long as they need.
    contextWindowCompression: { slidingWindow: {} },
    // Connections are recycled roughly every 10 minutes; the handle lets us resume seamlessly.
    sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
  };
}
