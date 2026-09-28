import type { PolicyDoc } from './types';

// Specimen wording written for this demo. Kestrel General Insurance is fictional.
export const healthPolicy: PolicyDoc = {
  id: 'health',
  insurer: 'Kestrel General Insurance Ltd.',
  product: 'Kestrel CarePlus',
  kind: 'Family Floater Health Insurance Policy',
  docCode: 'KGI-HLT-CP-WORDING-v3.2 (SPECIMEN)',
  schedule: [
    ['Policy number', 'KGI/HLT/2026/004817'],
    ['Policyholder', 'Ananya Rao'],
    ['Insured persons', 'Ananya Rao (34), Vikram Rao (37), Aarav Rao (6)'],
    ['Plan', 'CarePlus Silver · Family Floater'],
    ['Sum insured', '₹5,00,000 per policy year (floater)'],
    ['Cumulative bonus', '₹50,000'],
    ['Policy period', '14 Mar 2026 to 13 Mar 2027'],
    ['First inception with us', '14 Mar 2025'],
    ['Room rent limit', '1% of sum insured per day (ICU 2%)'],
    ['Co-payment', 'Nil (see Clause 6.1 for age-based co-payment)'],
    ['Claims desk', 'claims@kestrel.example · 24x7 helpline on your e-card'],
  ],
  preamble:
    'This policy is a contract between you and us. We will cover medical expenses for the insured persons named in the Schedule, as described in this wording, for illness or injury that first occurs or is diagnosed during the policy period. Words in bold have the meaning given in Section 2. Please read the Schedule together with this wording.',
  sections: [
    {
      ref: '2',
      title: 'Definitions',
      clauses: [
        {
          ref: '2.1',
          title: 'Hospital',
          body: [
            'Any institution registered as a hospital with the local authorities, with at least 10 in-patient beds in towns with a population below ten lakh and 15 beds elsewhere, qualified nursing staff round the clock, a fully equipped operation theatre, and daily records of patients.',
          ],
        },
        {
          ref: '2.2',
          title: 'Hospitalisation',
          body: [
            'Admission in a hospital for a minimum of 24 consecutive in-patient care hours, except for the day care procedures listed in Annexure II, where the 24-hour requirement does not apply.',
          ],
        },
        {
          ref: '2.3',
          title: 'Pre-existing disease',
          body: [
            'Any condition, ailment, injury or disease that was diagnosed by a physician, or for which medical advice or treatment was recommended or received, within 36 months before the date of first inception of this policy with us.',
          ],
        },
        {
          ref: '2.4',
          title: 'Network hospital and cashless facility',
          body: [
            'A network hospital is a hospital that has an agreement with us to provide treatment on a cashless basis. Cashless facility means we pay the network hospital directly, to the extent of the pre-authorisation approved, and you pay only amounts that are not covered.',
          ],
        },
        {
          ref: '2.5',
          title: 'Associated medical expenses',
          body: [
            'Room rent, nursing charges, operation theatre charges, fees of the surgeon, anaesthetist and consultants, and any other charges that vary with the category of room occupied. Associated medical expenses do not include the cost of medicines, consumables, implants, medical devices and diagnostics.',
          ],
        },
      ],
    },
    {
      ref: '3',
      title: 'What is covered',
      clauses: [
        {
          ref: '3.1',
          title: 'In-patient hospitalisation',
          body: [
            'We will pay the reasonable and customary medical expenses incurred for hospitalisation of an insured person for more than 24 hours on the advice of a medical practitioner, up to the sum insured, including:',
          ],
          items: [
            'room, boarding and nursing charges, subject to Clause 3.6;',
            'intensive care unit (ICU) charges, subject to Clause 3.6;',
            'fees of the surgeon, anaesthetist, medical practitioner, consultants and specialists;',
            'anaesthesia, blood, oxygen, operation theatre charges, surgical appliances, medicines and drugs, diagnostic materials and X-ray;',
            'cost of prosthetic and other devices or implants inserted during a surgical procedure.',
          ],
        },
        {
          ref: '3.2',
          title: 'Pre-hospitalisation expenses',
          body: [
            'Medical expenses incurred in the 30 days immediately before the date of admission, provided they relate to the same condition for which the insured person was later hospitalised and the hospitalisation claim is admissible.',
          ],
        },
        {
          ref: '3.3',
          title: 'Post-hospitalisation expenses',
          body: [
            'Medical expenses incurred in the 60 days immediately after discharge, provided they relate to the same condition and the hospitalisation claim is admissible.',
          ],
        },
        {
          ref: '3.4',
          title: 'Day care procedures',
          body: [
            'Treatment for the day care procedures listed in Annexure II, taken in a hospital or day care centre, even where hospitalisation is for less than 24 hours.',
          ],
        },
        {
          ref: '3.5',
          title: 'Road ambulance',
          body: [
            'Reasonable expenses for a registered road ambulance to take the insured person to the nearest hospital in an emergency, up to ₹2,500 per hospitalisation.',
          ],
        },
        {
          ref: '3.6',
          title: 'Room rent and ICU limits',
          body: [
            'Room rent is payable up to 1% of the sum insured per day and ICU charges up to 2% of the sum insured per day.',
            'If an insured person occupies a room whose rent is higher than the eligible limit, we will pay the associated medical expenses in the same proportion as the eligible room rent bears to the actual room rent charged. This proportionate deduction does not apply to medicines, consumables, implants, medical devices and diagnostics, and does not apply to ICU charges.',
          ],
        },
        {
          ref: '3.7',
          title: 'AYUSH treatment',
          body: [
            'In-patient treatment under Ayurveda, Yoga and Naturopathy, Unani, Siddha and Homeopathy in a government hospital or an accredited AYUSH hospital, up to the sum insured.',
          ],
        },
        {
          ref: '3.8',
          title: 'Modern treatment methods',
          body: [
            'Robotic surgery, stereotactic radio surgery, oral chemotherapy, immunotherapy and the other methods listed in Annexure III are covered up to 50% of the sum insured per policy year.',
          ],
        },
      ],
    },
    {
      ref: '4',
      title: 'Waiting periods',
      clauses: [
        {
          ref: '4.1',
          title: 'First 30 days',
          body: [
            'Expenses for any illness contracted within 30 days from the first policy commencement date are not covered, except claims arising from an accident. This waiting period does not apply on renewal.',
          ],
        },
        {
          ref: '4.2',
          title: 'Specified illnesses and procedures: 24 months',
          body: [
            'The following are covered only after 24 months of continuous coverage from the date of first inception with us, unless they arise from an accident:',
          ],
          items: [
            'cataract and other age-related eye disorders;',
            'hernia of all types, hydrocele;',
            'benign enlargement of the prostate;',
            'gall bladder and kidney stones (calculus diseases);',
            'haemorrhoids, fissure and fistula;',
            'sinusitis, deviated nasal septum and tonsillectomy;',
            'joint replacement surgery;',
            'hysterectomy and fibroids, unless for malignancy;',
            'varicose veins.',
          ],
        },
        {
          ref: '4.3',
          title: 'Pre-existing diseases: 36 months',
          body: [
            'Expenses related to a pre-existing disease declared in the proposal and accepted by us are covered only after 36 months of continuous coverage from the date of first inception with us.',
          ],
        },
        {
          ref: '4.4',
          title: 'Continuity of cover',
          body: [
            'Waiting periods run from the date of first inception with us and are credited on every continuous renewal. A break in renewal beyond the grace period of 30 days restarts all waiting periods.',
          ],
        },
      ],
    },
    {
      ref: '5',
      title: 'What is not covered',
      clauses: [
        {
          ref: '5.1',
          title: 'Investigation only',
          body: [
            'Admission primarily for diagnostic tests or evaluation, where no active treatment is given and the findings are not consistent with the diagnosis for which the insured person was admitted.',
          ],
        },
        {
          ref: '5.2',
          title: 'Cosmetic surgery',
          body: [
            'Cosmetic or plastic surgery, unless it is for reconstruction following an accident, burns or cancer, or is certified as medically necessary to treat an illness.',
          ],
        },
        {
          ref: '5.3',
          title: 'Self-harm and substance abuse',
          body: [
            'Treatment for intentional self-inflicted injury, and treatment for alcoholism, drug or substance abuse, or any addictive condition and its consequences.',
          ],
        },
        {
          ref: '5.4',
          title: 'Dental treatment',
          body: [
            'Dental treatment of any kind, unless it requires hospitalisation as a result of an accident.',
          ],
        },
        {
          ref: '5.5',
          title: 'Maternity',
          body: [
            'Medical expenses related to childbirth, including caesarean section, and lawful termination of pregnancy, except ectopic pregnancy.',
          ],
        },
        {
          ref: '5.6',
          title: 'Hazardous activities',
          body: [
            'Injury sustained while taking part in hazardous or adventure sports such as para-jumping, rock climbing, mountaineering, motor racing, scuba diving and bungee jumping.',
          ],
        },
        {
          ref: '5.7',
          title: 'Non-payable items',
          body: [
            'Items listed as non-payable in Annexure I, including admission kits, toiletries, attendant and visitor charges, food other than the patient diet, telephone and television charges, and documentation charges.',
          ],
        },
      ],
    },
    {
      ref: '6',
      title: 'Cost sharing',
      clauses: [
        {
          ref: '6.1',
          title: 'Age-based co-payment',
          body: [
            'If an insured person was 61 years or older when first covered under this policy, they bear 20% of every admissible claim amount. This co-payment applies after all other deductions.',
          ],
        },
        {
          ref: '6.2',
          title: 'Treatment at a non-network hospital',
          body: [
            'For planned treatment at a non-network hospital, the insured person bears 10% of the admissible claim amount. This does not apply to emergency hospitalisation.',
          ],
        },
      ],
    },
    {
      ref: '7',
      title: 'How to make a claim',
      clauses: [
        {
          ref: '7.1',
          title: 'Telling us about a claim',
          body: [
            'Notify the claims desk within 24 hours of an emergency admission, and at least 48 hours before a planned admission.',
          ],
        },
        {
          ref: '7.2',
          title: 'Cashless claims',
          body: [
            'At a network hospital, show your e-card at the insurance desk and request pre-authorisation. We will respond to the hospital within one hour for a pre-authorisation request and within three hours of the discharge request.',
          ],
        },
        {
          ref: '7.3',
          title: 'Reimbursement claims',
          body: [
            'If you pay the hospital yourself, submit the claim documents within 30 days of discharge. Bills for post-hospitalisation expenses must be submitted within 15 days of the end of the post-hospitalisation period.',
          ],
        },
        {
          ref: '7.4',
          title: 'Documents',
          body: ['Please provide:'],
          items: [
            'the completed claim form;',
            'discharge summary;',
            'final hospital bill with an itemised break-up, and payment receipts;',
            'investigation and diagnostic reports, with the prescriptions advising them;',
            'pharmacy bills with prescriptions;',
            'for accidents, the medico-legal certificate or FIR where one was registered;',
            'KYC documents of the proposer and bank details for NEFT payment.',
          ],
        },
        {
          ref: '7.5',
          title: 'Delays',
          body: [
            'We will condone a delay in notification or document submission where you tell us the reasons for the delay and they were beyond your reasonable control.',
          ],
        },
        {
          ref: '7.6',
          title: 'Claim settlement',
          body: [
            'We will settle or reject a claim within 30 days of receiving the last necessary document. If we are late, we will pay interest at 2% above the bank rate for the period of delay.',
          ],
        },
      ],
    },
    {
      ref: '8',
      title: 'Cumulative bonus',
      clauses: [
        {
          ref: '8.1',
          title: 'Claim-free years',
          body: [
            'For each claim-free policy year, we increase the sum insured by 10%, up to a maximum of 50%. If a claim is paid, the cumulative bonus reduces by 10% of the sum insured at the next renewal, but the sum insured itself is never reduced.',
          ],
        },
      ],
    },
    {
      ref: '9',
      title: 'Grievances',
      clauses: [
        {
          ref: '9.1',
          title: 'If you are unhappy',
          body: [
            'Write to our claims desk first. If you do not receive a satisfactory reply within 15 days, you may escalate to our Grievance Redressal Officer, and after that to the Insurance Ombudsman for your region.',
          ],
        },
      ],
    },
  ],
  prompts: [
    'My husband Vikram was admitted for dengue for three days. Are we covered?',
    'He stayed in a deluxe room at ₹8,000 a day. The bill was ₹1,80,000. How much will you pay?',
    'My doctor says I need kidney stone surgery next month. Can I claim it?',
    'What documents do I need for reimbursement?',
  ],
};
