import type { PolicyDoc } from './types';

// Specimen wording written for this demo. Kestrel General Insurance is fictional.
export const motorPolicy: PolicyDoc = {
  id: 'motor',
  insurer: 'Kestrel General Insurance Ltd.',
  product: 'Kestrel DriveSure',
  kind: 'Private Car Package Policy',
  docCode: 'KGI-MOT-DS-WORDING-v2.7 (SPECIMEN)',
  schedule: [
    ['Policy number', 'KGI/MOT/2026/118302'],
    ['Insured', 'Rohan Mehta'],
    ['Vehicle', 'Hatchback, petrol, 1197 cc · MH-02-XX-4521'],
    ['Year of manufacture', '2022'],
    ['Insured declared value (IDV)', '₹5,40,000'],
    ['No claim bonus', '20%'],
    ['Add-on covers', 'Zero Depreciation: Yes · Engine Protect: No · Roadside Assistance: Yes'],
    ['Compulsory deductible', '₹1,000'],
    ['Policy period', '02 Jun 2026 to 01 Jun 2027'],
    ['Claims desk', 'claims@kestrel.example · 24x7 helpline on your policy card'],
  ],
  preamble:
    'This policy is a contract between you and us. In return for the premium paid, we will indemnify you against loss or damage to the insured vehicle and against legal liability to third parties, as set out in this wording and the Schedule, during the policy period.',
  sections: [
    {
      ref: '1',
      title: 'Own damage (Section I)',
      clauses: [
        {
          ref: '1.1',
          title: 'What we cover',
          body: ['We will pay for loss of or damage to the insured vehicle and its accessories caused by:'],
          items: [
            'fire, explosion, self-ignition or lightning;',
            'burglary, housebreaking or theft;',
            'riot, strike or malicious act;',
            'flood, storm, cyclone, hurricane, inundation, earthquake or landslide;',
            'accidental external means;',
            'transit by road, rail, inland waterway, lift, elevator or air.',
          ],
        },
        {
          ref: '1.2',
          title: 'Insured declared value',
          body: [
            'The insured declared value (IDV) is the most we will pay for a total loss or theft of the vehicle. It is fixed at the start of each policy period on the manufacturer\'s listed price, adjusted for the age of the vehicle.',
          ],
        },
        {
          ref: '1.3',
          title: 'Depreciation on parts',
          body: [
            'Where parts are replaced, we deduct depreciation from the cost of the new parts as follows, unless the Zero Depreciation add-on (Clause 4.1) is in force:',
          ],
          table: {
            head: ['Part', 'Depreciation'],
            rows: [
              ['Rubber, nylon and plastic parts, tyres, tubes and batteries', '50%'],
              ['Fibreglass components', '30%'],
              ['Glass parts', 'Nil'],
              ['Metal parts, vehicle up to 6 months old', 'Nil'],
              ['Metal parts, 6 months to 1 year', '5%'],
              ['Metal parts, 1 to 2 years', '10%'],
              ['Metal parts, 2 to 3 years', '15%'],
              ['Metal parts, 3 to 4 years', '25%'],
              ['Metal parts, 4 to 5 years', '35%'],
            ],
          },
        },
        {
          ref: '1.4',
          title: 'Compulsory deductible',
          body: [
            'You bear the first ₹1,000 of each own-damage claim for vehicles up to 1500 cc, and the first ₹2,000 for vehicles above 1500 cc. The deductible does not apply to a total loss or theft.',
          ],
        },
      ],
    },
    {
      ref: '2',
      title: 'Liability to third parties (Section II)',
      clauses: [
        {
          ref: '2.1',
          title: 'Third party cover',
          body: [
            'We will indemnify you against legal liability for death of or bodily injury to any person, and for damage to third-party property up to ₹7,50,000, arising out of the use of the insured vehicle, as required by the Motor Vehicles Act, 1988.',
          ],
        },
      ],
    },
    {
      ref: '3',
      title: 'Personal accident cover for the owner-driver (Section III)',
      clauses: [
        {
          ref: '3.1',
          title: 'Owner-driver cover',
          body: [
            'We will pay ₹15,00,000 if the owner-driver, holding a valid driving licence, suffers death or permanent total disablement from an accident while driving, mounting or dismounting the insured vehicle.',
          ],
        },
      ],
    },
    {
      ref: '4',
      title: 'Add-on covers',
      clauses: [
        {
          ref: '4.1',
          title: 'Zero Depreciation',
          body: [
            'Where shown as opted in the Schedule, we will not deduct depreciation on parts replaced in an admissible own-damage claim. This add-on applies to a maximum of two claims in a policy year. Tyres and tubes are covered only if damaged in the same accident as other parts of the vehicle.',
          ],
        },
        {
          ref: '4.2',
          title: 'Engine Protect',
          body: [
            'Where shown as opted in the Schedule, we will pay for damage to the engine and gearbox caused by water ingression, hydrostatic lock or leakage of lubricating oil following an accident.',
          ],
        },
        {
          ref: '4.3',
          title: 'Roadside Assistance',
          body: [
            'Where shown as opted in the Schedule, we will arrange towing to the nearest authorised workshop up to 50 km, flat tyre and battery jump-start help, and emergency fuel delivery, anywhere in India, 24 hours a day.',
          ],
        },
      ],
    },
    {
      ref: '5',
      title: 'General exclusions',
      clauses: [
        {
          ref: '5.1',
          title: 'Drink and drugs',
          body: [
            'Any loss or damage while the vehicle is driven by a person under the influence of alcohol or drugs.',
          ],
        },
        {
          ref: '5.2',
          title: 'No valid licence',
          body: [
            'Any loss or damage while the vehicle is driven by a person who does not hold a valid and effective driving licence for that class of vehicle.',
          ],
        },
        {
          ref: '5.3',
          title: 'Wear and tear',
          body: [
            'Normal wear and tear, depreciation, mechanical or electrical breakdown, and any consequential loss.',
          ],
        },
        {
          ref: '5.4',
          title: 'Engine damage from water',
          body: [
            'Damage to the engine caused by water ingression or hydrostatic lock, including when the vehicle is driven or cranked in water-logged conditions, unless the Engine Protect add-on (Clause 4.2) is in force.',
          ],
        },
        {
          ref: '5.5',
          title: 'Commercial use',
          body: ['Use of the vehicle for hire or reward, racing, speed testing or reliability trials.'],
        },
      ],
    },
    {
      ref: '6',
      title: 'How to make a claim',
      clauses: [
        {
          ref: '6.1',
          title: 'Telling us',
          body: [
            'Inform us immediately, and in any case within 48 hours of the accident or loss. For theft, also file an FIR with the police within 24 hours of discovering it.',
          ],
        },
        {
          ref: '6.2',
          title: 'Survey before repair',
          body: [
            'Do not start repairs, other than those needed to make the vehicle safe, until our surveyor has inspected the damage or we have told you in writing that you may proceed.',
          ],
        },
        {
          ref: '6.3',
          title: 'Cashless repair',
          body: [
            'At a network garage we pay the garage directly for the approved repair cost. You pay the compulsory deductible, any depreciation not covered, and any items that are not admissible.',
          ],
        },
        {
          ref: '6.4',
          title: 'Documents',
          body: ['Please provide:'],
          items: [
            'the completed claim form;',
            'copy of the registration certificate;',
            'copy of the driving licence of the person driving at the time;',
            'FIR, for theft, third-party injury or major accidents;',
            'repair estimate and, after repairs, the final invoice and payment receipt.',
          ],
        },
        {
          ref: '6.5',
          title: 'Theft and total loss',
          body: [
            'A theft claim is settled at the IDV after the police issue a final report that the vehicle is untraced, and you transfer the vehicle\'s documents and keys to us.',
          ],
        },
      ],
    },
    {
      ref: '7',
      title: 'No claim bonus',
      clauses: [
        {
          ref: '7.1',
          title: 'Earning and losing NCB',
          body: [
            'For every claim-free year you earn a discount on the own-damage premium at renewal: 20%, 25%, 35%, 45% and then 50% for five or more claim-free years. The bonus is lost at the next renewal if any own-damage claim is paid.',
          ],
        },
      ],
    },
  ],
  prompts: [
    'I drove through a flooded underpass and now the engine won\'t start. Will you cover it?',
    'Someone scraped my car in a parking lot. The bumper needs replacing, the estimate is ₹38,000.',
    'Will making a claim affect my no claim bonus?',
    'My car was stolen last night. What do I do first?',
  ],
};
