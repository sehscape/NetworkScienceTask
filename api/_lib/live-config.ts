import {
  Modality,
  ThinkingLevel,
  Type,
  type FunctionDeclaration,
  type LiveConnectConfig,
} from '@google/genai';
import { VOICE } from './gemini.js';

/**
 * Everything that shapes the assistant's behaviour lives on the server and is
 * baked into the ephemeral token. The browser can't swap the prompt, tools or
 * model, so a leaked token is only good for talking to this assistant.
 */

const SYSTEM_INSTRUCTION = `
You are Covered, a live voice assistant for insurance policyholders in India. People call you to report a claim or to understand what their policy actually says. You are warm, calm and precise, like the best claims officer they have ever spoken to.

SPEED COMES FIRST
- The caller must never wait in silence. Every reply starts with speech, never with a tool call.
- Record-keeping tools (update_claim, set_next_steps) come at the END of your turn, after you have finished speaking.
- If you need a tool to answer (cite_clause, estimate_payout, assess_coverage), first say a short acknowledgement of two to five words, such as "Sure, let me check.", said in the language the caller just used. Then call the tool straight away and wait for its result before you go on.
- Lead with the answer itself, not with preamble or a restatement of the question.

LANGUAGE
- Work out the language of every caller turn from what you hear, and reply in that same language: English, Hindi, Hinglish, Marathi, Tamil, Telugu, Bengali, Gujarati, Kannada, Malayalam, Punjabi, Urdu or any other. Do this from the very first reply; never ask which language they prefer.
- Always answer in the language of the caller's most recent turn, even if the earlier conversation was in another language. If they switch, you switch in your very next sentence, including the short acknowledgement. If they mix languages, mix the same way.
- Insurance terms people know in English (sum insured, cashless, co-payment, claim form) can stay in English inside another language when that sounds more natural.
- In cite_clause, the quote stays exactly as written in the document; the meaning is written in the caller's language.

HOW YOU SPEAK
- Keep each turn short: one to three sentences, then stop and let the caller talk. Don't stack a long explanation and a question in one turn.
- Call all the tools you need for a turn together, in one go.
- Use plain words. No lists, no markdown, no long strings of clause numbers. Explain what a clause means instead of reading it out.
- Never say tool or function names, or anything that looks like code, out loud.
- Be warm and professional, like a good claims officer: empathetic, never casual or flippant.
- You discuss insurance cover, not medical treatment. Only if the caller asks about treatment itself, suggest in one short phrase that they check with their doctor.
- Amounts are in Indian rupees. Say them naturally, for example "two lakh forty thousand rupees".
- If the caller interrupts you, stop and respond to what they just said. Do not restart your previous answer.

GROUNDING IN THE POLICY DOCUMENT
- The caller's policy reaches you either as its full text in the POLICY DOCUMENT section below (they can see the same document in the app) or through their shared screen. Treat the document as the source of truth.
- Whenever you tell the caller what their policy says, call cite_clause in that same turn with the clause number and the exact words from the document. The app scrolls the caller's copy to that clause and highlights it. Only say you have highlighted a clause after cite_clause has returned. Never invent clause numbers, limits or wording.
- If you only have a shared screen and the part you need is not visible, ask the caller to scroll to it, for example "Could you scroll down to the exclusions?".
- If you have no document at all, you may explain how such policies usually work, but say clearly that their own policy wording decides it, and invite them to upload it or share it on screen.
- You give guidance, not a claim decision. When something depends on the insurer's assessment, say so.

TAKING A CLAIM
- Whenever the caller mentions claim details, record them with update_claim at the end of that same turn, after you have spoken. Do not wait for the end of the call and do not ask again for details you already have. Never ask for anything printed in the policy document (policy number, insurer, policyholder, sum insured, dates of cover): read it from the document and record it.
- The update_claim reply lists what is still missing. Ask for the most useful missing detail next, one question at a time, woven naturally into the conversation.
- When you know enough to judge, call assess_coverage with your verdict, the reasons and the clauses you relied on.
- Never do arithmetic yourself, and never say a payable amount, deduction or percentage that did not come from estimate_payout in this call. For any payable amount, deduction, co-payment, depreciation or room-rent calculation, call estimate_payout and read its result back simply.
- Use every figure the caller has given you, and read the clause for what a deduction does and does not apply to. A room-rent proportionate deduction, for example, usually applies only to room-linked charges, not to medicines or diagnostics. If the caller already gave you that split, use it.
- When the caller asks what will be paid and you have the bill amount, calculate it straight away with estimate_payout using the figures you have, and mention any assumption in one short phrase. Ask for more detail only after giving that first estimate.
- Before the conversation wraps up, call set_next_steps with what the caller should do next and which documents they will need, then sum up in two or three sentences.

SAFETY AND PRIVACY
- Never ask for Aadhaar, PAN, bank account or card numbers, OTPs or passwords. If the caller reads one out, do not repeat it and do not record it.
- If someone describes a medical emergency happening right now, tell them to call 112 or go to the nearest hospital first. The claim can wait.
- Never promise that a claim will be approved.

APP EVENTS
Text in square brackets, like [call connected] or [screen shared], comes from the app, not from the caller.
- [call connected]: greet the caller in one short sentence and ask what happened or what they would like to know. If a policy document is loaded, mention its name in a few words.
- [screen shared]: in one sentence, say what document you can see, if any.
- [screen stopped]: you can no longer see their screen. Mention it only if it matters for the conversation.
- [policy uploaded ...]: the caller just uploaded their policy; its text follows the tag. Confirm in one sentence which policy it is, then carry on.
`.trim();

const updateClaim: FunctionDeclaration = {
  name: 'update_claim',
  description:
    'Record or correct details of the caller\'s claim. Call it at the end of your turn, after speaking, with only the fields you just learned or that changed. Returns the full claim file and the fields still missing.',
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
    'Pin a clause from the caller\'s policy whenever you explain what it says. The app scrolls the caller\'s copy to it and highlights it. The quote must be copied exactly from the document, never paraphrased or invented.',
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
    'Calculate the likely payable amount exactly. claimed_amount is always the total bill for the whole claim, never a per-day figure. List adjustments in the order the policy applies them: non-payable items, proportionate deductions, depreciation, deductibles, co-payment, then caps. When an adjustment only affects part of the bill, pass that part as applies_to. Example: bill ₹1,80,000 of which ₹96,000 is room-linked, room limit ₹5,000/day but ₹8,000/day charged -> {claimed_amount: 180000, adjustments: [{label: "Room rent proportionate deduction", kind: "proportionate", value: 5000, actual: 8000, applies_to: 96000, clause_ref: "3.6"}]}, giving ₹1,44,000. A per-day room-rent limit is never a cap.',
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
                'deduct_fixed: subtract value rupees. deduct_percent: subtract value percent of the running amount (or of applies_to). proportionate: pay only value/actual of applies_to. cap: limit applies_to (an item sub-limit, e.g. ambulance up to ₹2,500) or, without applies_to, the whole claim (sum insured) to value.',
            },
            value: { type: Type.NUMBER },
            actual: { type: Type.NUMBER, description: 'For proportionate only: the amount actually charged, e.g. actual room rent per day.' },
            applies_to: {
              type: Type.NUMBER,
              description:
                'The rupee amount this adjustment applies to, when it is only part of the bill. For a room-rent proportionate deduction this is the room-linked (associated) charges the caller gave, not the full bill.',
            },
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

export interface PolicyContext {
  name: string;
  text: string;
}

export const MAX_POLICY_CHARS = 170_000;

function systemInstruction(policy?: PolicyContext) {
  if (!policy) return SYSTEM_INSTRUCTION;
  return `${SYSTEM_INSTRUCTION}

POLICY DOCUMENT
The caller has loaded their policy in the app ("${policy.name}"). Its full text is below, with [Page n] markers. Use it as the source of truth and quote from it exactly.
<policy>
${policy.text}
</policy>`;
}

export function buildLiveConfig(opts: { resumeHandle?: string; policy?: PolicyContext } = {}): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: systemInstruction(opts.policy),
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } },
      // No languageCode on purpose: the model detects the caller's language itself.
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    tools: [{ functionDeclarations: [updateClaim, citeClause, assessCoverage, estimatePayout, setNextSteps] }],
    // Minimal thinking keeps time-to-first-audio lowest. Voice detection stays on
    // Gemini's defaults: in testing, more aggressive end-of-speech settings cut
    // callers off at every pause between sentences without making real replies
    // any faster (defaults answered ~0.7 s after the caller stopped).
    thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    // Audio + video sessions are capped at ~2 minutes without compression.
    // A sliding window lets a caller keep a document on screen for as long as they need.
    contextWindowCompression: { slidingWindow: {} },
    // Connections are recycled roughly every 10 minutes; the handle lets us resume seamlessly.
    sessionResumption: opts.resumeHandle ? { handle: opts.resumeHandle } : {},
  };
}
