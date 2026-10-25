// Original practice papers written for Charis Study (not past university exams), each with a
// marking key, so every faculty in the library has something to practise from day one.

export interface SeedPaper {
  key: string;
  name: string;
  faculty: string;
  courseName: string;
  /** links the paper to the matching seeded book */
  book?: string;
  text: string;
  keyText: string;
}

const HEAD = (course: string, hours = '2 HOURS') => `CHARIS STUDY PRACTICE PAPER — ${course.toUpperCase()}
(An original practice paper in university format. It is not a past examination of any university.)
TIME: ${hours}
TOTAL MARKS: 100
INSTRUCTIONS
Answer ALL questions in Section A and any TWO questions in Section B.
`;

export const SEED_PAPERS: SeedPaper[] = [
  {
    key: 'anatomy-1',
    name: 'Human Anatomy & Physiology I — practice paper',
    faculty: 'medicine',
    courseName: 'Human Anatomy and Physiology',
    book: 'anatomy-and-physiology-2e',
    text: `${HEAD('Human Anatomy and Physiology I')}
SECTION A (40 MARKS)
1. Define the following terms: (a) anatomy (b) physiology (c) homeostasis (6 marks)
2. List the six levels of structural organisation of the human body, from smallest to largest. (6 marks)
3. Distinguish between negative feedback and positive feedback, giving one example of each. (6 marks)
4. State four functions of the cell membrane. (4 marks)
5. Distinguish between diffusion and osmosis. (4 marks)
6. Name the four basic types of tissue in the human body. (4 marks)
7. Describe the anatomical position. (4 marks)
8. State three functions of epithelial tissue. (6 marks)
SECTION B (60 MARKS)
9. (a) Describe the structure of the cell membrane according to the fluid mosaic model. (18 marks)
   (b) Explain how the sodium-potassium pump moves ions across the membrane. (12 marks)
10. Discuss the stages of mitosis and explain why mitosis is important to the body. (30 marks)
11. With the aid of examples, explain how body temperature is regulated by negative feedback. (30 marks)
12. (a) Describe the structure and functions of connective tissue. (15 marks)
    (b) Compare skeletal, cardiac and smooth muscle tissue. (15 marks)`,
    keyText: `1. (a) Anatomy: the scientific study of the body's structures (1 mark per correct definition, 2 marks each with an example). (b) Physiology: the scientific study of how the body's structures function / the chemistry and physics of the body. (c) Homeostasis: maintaining a relatively stable internal environment (e.g. temperature, blood glucose) despite changes outside.
2. Chemical; cellular; tissue; organ; organ system; organism (1 mark each, in order).
3. Negative feedback reverses a change back towards the set point (e.g. control of body temperature or blood glucose). Positive feedback strengthens a change until an end point is reached (e.g. uterine contractions in childbirth, blood clotting). 2 marks each definition, 1 mark each example.
4. Any four: forms a barrier between the cell and its environment; controls what enters and leaves (selective permeability); cell recognition / identity; receives signals (receptors); attachment to other cells; transport through channels and pumps.
5. Diffusion: movement of a substance from an area of higher concentration to lower concentration. Osmosis: diffusion of water across a semipermeable membrane from lower solute concentration to higher solute concentration.
6. Epithelial tissue; connective tissue; muscle tissue; nervous tissue.
7. Body upright, facing forward, feet flat and slightly apart, arms at the sides, palms facing forward, thumbs pointing away from the body (1 mark per point).
8. Any three: protection; absorption; secretion (glands); filtration; excretion; sensory reception (2 marks each).
9. (a) Phospholipid bilayer: hydrophilic heads face the watery fluid inside and outside, hydrophobic tails face each other; cholesterol for fluidity; integral proteins span the membrane (channels, carriers); peripheral proteins on the surfaces; glycoproteins and glycolipids form the glycocalyx for recognition; "fluid" because components move sideways; "mosaic" because proteins are scattered. (b) Active transport using ATP; pumps 3 sodium ions out and 2 potassium ions in for each ATP; keeps sodium high outside and potassium high inside; maintains the resting membrane potential and cell volume.
10. Prophase: chromatin condenses into chromosomes, nuclear envelope breaks down, spindle forms. Metaphase: chromosomes line up on the metaphase plate. Anaphase: sister chromatids separate to opposite poles. Telophase: nuclear envelopes reform, chromosomes uncoil. Cytokinesis divides the cytoplasm. Importance: growth, repair and replacement of cells, two genetically identical daughter cells. Award up to 4 marks per stage explained and up to 10 for importance with examples.
11. Receptors (thermoreceptors in skin) detect change; control centre (hypothalamus) compares with set point (about 37 °C); effectors respond. When hot: sweating, vasodilation of skin vessels. When cold: shivering, vasoconstriction, raised metabolism. The response reverses the change. Award marks for each component and correct examples.
12. (a) Cells (fibroblasts, adipocytes, macrophages) in an extracellular matrix of ground substance and protein fibres (collagen, elastic, reticular); types: loose, dense, cartilage, bone, blood; functions: support, connection, protection, transport (blood), storage of fat, immunity. (b) Skeletal: striated, voluntary, multinucleated, attached to bones. Cardiac: striated, involuntary, branched cells joined by intercalated discs, in the heart. Smooth: non-striated, involuntary, spindle-shaped, in walls of hollow organs and vessels.`,
  },
  {
    key: 'microbiology-1',
    name: 'Microbiology — practice paper',
    faculty: 'medicine',
    courseName: 'Microbiology',
    book: 'microbiology',
    text: `${HEAD('Microbiology')}
SECTION A (40 MARKS)
1. Define the following terms: (a) pathogen (b) normal microbiota (c) sterilisation (6 marks)
2. Distinguish between prokaryotic and eukaryotic cells. (6 marks)
3. State four steps of the Gram stain procedure in the correct order. (4 marks)
4. Name three shapes of bacteria and give an example of each. (6 marks)
5. Distinguish between a virus and a bacterium. (6 marks)
6. State four modes of transmission of infectious disease. (4 marks)
7. Outline Koch's postulates. (4 marks)
8. Distinguish between innate and adaptive immunity. (4 marks)
SECTION B (60 MARKS)
9. (a) Describe the phases of the bacterial growth curve. (22 marks)
   (b) Explain why antibiotics work best on bacteria in the log phase. (8 marks)
10. Discuss the mechanisms by which bacteria become resistant to antibiotics and how antibiotic resistance can be reduced in a hospital. (30 marks)
11. With the aid of examples, explain the methods used to control microbial growth. (30 marks)
12. (a) Describe the steps of the lytic cycle of a bacteriophage. (15 marks)
    (b) Explain how vaccines produce immunity. (15 marks)`,
    keyText: `1. (a) Pathogen: a microorganism that can cause disease. (b) Normal microbiota: microorganisms that normally live on or in the body without causing disease. (c) Sterilisation: complete removal or killing of all microorganisms, including endospores, from an object.
2. Prokaryotes: no nucleus (nucleoid), no membrane-bound organelles, 70S ribosomes, usually smaller (bacteria, archaea). Eukaryotes: true nucleus, membrane-bound organelles such as mitochondria, 80S ribosomes, usually larger.
3. Crystal violet (primary stain); Gram's iodine (mordant); alcohol/acetone (decolouriser); safranin (counterstain). Gram-positive stain purple, Gram-negative stain pink.
4. Coccus (spherical, e.g. Staphylococcus); bacillus (rod, e.g. Escherichia coli); spirillum/spiral (e.g. Treponema, Helicobacter) — 1 mark shape, 1 mark example.
5. Virus: not cellular, needs a host cell to replicate, DNA or RNA genome in a protein capsid, not affected by antibiotics. Bacterium: a living prokaryotic cell, can reproduce by binary fission, has ribosomes and metabolism, can be treated with antibiotics.
6. Any four: contact (direct or indirect); droplet; airborne; vehicle (food, water); vector (e.g. mosquitoes); vertical (mother to child).
7. The microbe is found in all cases of the disease; it is isolated and grown in pure culture; it causes the same disease when given to a healthy host; it is isolated again from that host.
8. Innate: present from birth, non-specific, fast, no memory (skin, phagocytes, inflammation, fever). Adaptive: specific, slower at first, has memory (B cells and antibodies, T cells).
9. (a) Lag phase: cells adjust and make enzymes, little division. Log (exponential) phase: rapid division at a constant rate. Stationary phase: nutrients run out and wastes build up, division equals death. Death (decline) phase: cells die faster than they divide. (b) Many antibiotics act on processes of growing cells, such as cell wall or protein synthesis.
10. Mechanisms: enzymes that destroy the drug (e.g. beta-lactamase); changing the drug's target; pumping the drug out (efflux pumps); reduced uptake; gene transfer by plasmids (conjugation, transformation, transduction); selection by misuse. Reduction: prescribe only when needed, complete the dose, culture and sensitivity testing, hand hygiene, isolation, antibiotic stewardship, surveillance.
11. Physical: heat (autoclave 121 °C, boiling, dry heat), pasteurisation, refrigeration, radiation, filtration, drying. Chemical: disinfectants and antiseptics (alcohols, chlorine, iodine, phenolics), with examples and when each is used. Explain sterilisation versus disinfection.
12. (a) Attachment to receptors; penetration (injection of nucleic acid); biosynthesis of viral parts; maturation/assembly; release by lysis of the cell. (b) Vaccines contain antigens (killed, weakened, subunit or toxoid); they stimulate B and T cells; memory cells form; on later exposure the secondary response is faster and stronger, preventing disease; herd immunity.`,
  },
  {
    key: 'public-health-1',
    name: 'Introduction to Public Health and Epidemiology — practice paper',
    faculty: 'medicine',
    courseName: 'Public Health and Epidemiology',
    text: `${HEAD('Introduction to Public Health and Epidemiology')}
SECTION A (40 MARKS)
1. Define the following terms: (a) epidemiology (b) incidence (c) prevalence (6 marks)
2. Distinguish between an epidemic and a pandemic. (4 marks)
3. Name three types of epidemiological study designs. (6 marks)
4. State the three levels of disease prevention and give an example of each. (6 marks)
5. List four elements of primary health care. (4 marks)
6. Distinguish between descriptive and analytic epidemiology. (4 marks)
7. Outline the epidemiological triangle. (6 marks)
8. State four uses of a disease surveillance system. (4 marks)
SECTION B (60 MARKS)
9. Describe the steps taken when investigating a disease outbreak. (30 marks)
10. Discuss the factors that contribute to the spread of malaria in a community and the measures used to control it. (30 marks)
11. With the aid of examples, explain the advantages and disadvantages of cohort and case-control studies. (30 marks)
12. (a) Explain the importance of vaccination programmes in public health. (15 marks)
    (b) Describe the role of community health workers in primary health care. (15 marks)`,
    keyText: `1. (a) Epidemiology: the study of the distribution and determinants of health-related states in populations, and the use of this study to control health problems. (b) Incidence: the number of new cases of a disease in a population during a period of time. (c) Prevalence: the total number of existing cases (new and old) at a point or period of time.
2. Epidemic: more cases than expected in a particular area or population at a time. Pandemic: an epidemic that has spread across several countries or continents.
3. Any three: cross-sectional; case-control; cohort; ecological; experimental/randomised controlled trial (2 marks each).
4. Primary: prevents disease before it happens (immunisation, bed nets). Secondary: early detection and treatment (screening). Tertiary: reduces complications of established disease (rehabilitation).
5. Any four: health education; nutrition; safe water and sanitation; maternal and child health and family planning; immunisation; control of endemic diseases; treatment of common diseases; essential drugs.
6. Descriptive: describes who, where and when (person, place, time). Analytic: tests hypotheses about causes by comparing groups.
7. Agent (the cause, e.g. a microbe), host (the person: age, immunity, behaviour) and environment (factors that bring them together, e.g. sanitation, climate); disease results from their interaction.
8. Any four: detect outbreaks early; monitor trends; plan and evaluate programmes; set priorities; guide allocation of resources.
9. Prepare for field work; confirm the outbreak and diagnosis; define a case and find cases; describe by time, place and person; develop hypotheses; test hypotheses (analytic study); carry out control and prevention measures; communicate findings. About 2–3 marks per step explained.
10. Factors: Anopheles mosquito breeding sites (stagnant water), climate, poor housing, low use of nets, poverty, drug resistance, poor access to care. Control: insecticide-treated nets, indoor residual spraying, removing breeding sites, prompt diagnosis and treatment (artemisinin combination therapy), intermittent preventive treatment in pregnancy, health education.
11. Cohort: follows exposed and unexposed people forward; measures incidence and relative risk; good for rare exposures; but expensive, long, loss to follow-up. Case-control: compares people with and without the disease, looks back at exposure; quick, cheap, good for rare diseases; but recall bias, cannot measure incidence (uses odds ratio). Credit relevant examples.
12. (a) Prevents disease and death, herd immunity, eradication (smallpox) and elimination (polio), cost-effective, reduces antibiotic use. (b) Health education, home visits, community mobilisation, referrals, simple treatment and follow-up, data collection, linking community to health facilities.`,
  },
  {
    key: 'psychology-1',
    name: 'Introduction to Psychology — practice paper',
    faculty: 'medicine',
    courseName: 'Psychology',
    book: 'psychology-2e',
    text: `${HEAD('Introduction to Psychology')}
SECTION A (40 MARKS)
1. Define psychology. (2 marks)
2. Distinguish between classical conditioning and operant conditioning. (6 marks)
3. Name the five stages of psychosexual development described by Freud. (5 marks)
4. State four stages of cognitive development according to Piaget. (4 marks)
5. Distinguish between short-term memory and long-term memory. (4 marks)
6. Outline Maslow's hierarchy of needs. (5 marks)
7. State four methods of research used in psychology. (4 marks)
8. Distinguish between sensation and perception. (4 marks)
9. Name three neurotransmitters and state a function of each. (6 marks)
SECTION B (60 MARKS)
10. Discuss the causes and management of stress among university students. (30 marks)
11. With the aid of examples, explain how memory works and why we forget. (30 marks)
12. (a) Describe the major perspectives in psychology. (15 marks)
    (b) Explain the ethical principles that guide psychological research. (15 marks)`,
    keyText: `1. The scientific study of the mind and behaviour.
2. Classical: learning by association of a neutral stimulus with a stimulus that produces a reflex response (Pavlov's dogs). Operant: learning from the consequences of behaviour, reinforcement or punishment (Skinner).
3. Oral; anal; phallic; latency; genital.
4. Sensorimotor; preoperational; concrete operational; formal operational.
5. Short-term: limited capacity (about 7 items), lasts seconds without rehearsal. Long-term: very large capacity, can last a lifetime; information is encoded, stored and retrieved.
6. From the base: physiological needs; safety; love and belonging; esteem; self-actualisation — lower needs are met before higher ones.
7. Any four: experiments; surveys; case studies; naturalistic observation; correlational studies; archival research.
8. Sensation: detecting physical energy by the sense organs. Perception: organising and interpreting that sensory information.
9. Any three, e.g. dopamine (reward, movement); serotonin (mood, sleep); acetylcholine (muscle action, memory); GABA (inhibition, calming); norepinephrine (arousal).
10. Causes: academic workload, exams, finances, relationships, homesickness, uncertainty about jobs. Effects: physical and mental. Management: time management, exercise, sleep, social support, relaxation techniques, counselling services, healthy coping instead of substances.
11. Encoding, storage and retrieval; sensory, short-term and long-term memory; rehearsal and organisation. Forgetting: decay, interference (proactive, retroactive), retrieval failure, motivated forgetting, amnesia. Credit study tips such as spaced repetition and testing.
12. (a) Biological, psychodynamic, behavioural, cognitive, humanistic, sociocultural, evolutionary — what each focuses on. (b) Informed consent; confidentiality; protection from harm; right to withdraw; debriefing; limited and justified deception; ethics committee approval.`,
  },
  {
    key: 'statistics-1',
    name: 'Introductory Statistics / Biostatistics — practice paper',
    faculty: 'sciences',
    courseName: 'Statistics',
    book: 'introductory-statistics-2e',
    text: `${HEAD('Introductory Statistics')}
SECTION A (40 MARKS)
1. Define the following terms: (a) population (b) sample (c) variable (6 marks)
2. Distinguish between qualitative and quantitative data, giving an example of each. (4 marks)
3. Name three measures of central tendency. (3 marks)
4. Calculate the mean, median and mode of: 4, 7, 7, 9, 13. (6 marks)
5. State four sampling methods. (4 marks)
6. Distinguish between a type I error and a type II error. (4 marks)
7. State three properties of the normal distribution. (6 marks)
8. Outline the difference between correlation and causation. (3 marks)
9. A fair coin is tossed twice. Find the probability of getting two heads. (4 marks)
SECTION B (60 MARKS)
10. (a) Describe the steps of hypothesis testing. (22 marks)
    (b) Explain the meaning of a p-value of 0.03 when the significance level is 0.05. (8 marks)
11. Discuss the measures of dispersion and explain why they are important when describing data. (30 marks)
12. (a) Explain the central limit theorem and why it is useful. (15 marks)
    (b) Describe how a 95% confidence interval for a mean is calculated and interpreted. (15 marks)`,
    keyText: `1. (a) Population: the whole group being studied. (b) Sample: a subset of the population that is actually studied. (c) Variable: a characteristic that can take different values for different individuals.
2. Qualitative (categorical): described by categories, e.g. blood group. Quantitative (numerical): measured or counted numbers, e.g. weight.
3. Mean; median; mode.
4. Mean = (4 + 7 + 7 + 9 + 13)/5 = 40/5 = 8. Median = 7 (middle value). Mode = 7. 2 marks each.
5. Any four: simple random; stratified; cluster; systematic; convenience.
6. Type I: rejecting a true null hypothesis (false positive). Type II: failing to reject a false null hypothesis (false negative).
7. Any three: bell-shaped; symmetric about the mean; mean = median = mode; total area under the curve = 1; about 68%, 95% and 99.7% of values lie within 1, 2 and 3 standard deviations.
8. Correlation shows that two variables change together; it does not prove that one causes the other (there may be a third, confounding variable).
9. P(HH) = 1/2 × 1/2 = 1/4 = 0.25.
10. (a) State the null and alternative hypotheses; choose the significance level; choose the test and check conditions; calculate the test statistic; find the p-value (or critical value); decide whether to reject the null hypothesis; state the conclusion in context. (b) If the null hypothesis were true there would be a 3% chance of results this extreme; since 0.03 < 0.05, reject the null hypothesis.
11. Range (largest minus smallest; affected by outliers); interquartile range (Q3 − Q1; resistant to outliers); variance (average squared deviation); standard deviation (square root of variance, same units as data); coefficient of variation. Importance: two data sets can share a mean but differ in spread; spread shows reliability, consistency and risk.
12. (a) The sampling distribution of the sample mean is approximately normal for large samples (n ≥ 30) whatever the population's shape, with mean μ and standard error σ/√n; allows confidence intervals and tests using the normal distribution. (b) Sample mean ± 1.96 × (σ/√n) (or t × s/√n); interpretation: we are 95% confident the interval contains the population mean; 95% of such intervals would capture it.`,
  },
  {
    key: 'chemistry-1',
    name: 'General Chemistry — practice paper',
    faculty: 'sciences',
    courseName: 'Chemistry',
    book: 'chemistry-2e',
    text: `${HEAD('General Chemistry')}
SECTION A (40 MARKS)
1. Define the following terms: (a) element (b) compound (c) mole (6 marks)
2. Distinguish between ionic and covalent bonding. (6 marks)
3. Name the three subatomic particles and state the charge of each. (6 marks)
4. Calculate the molar mass of water, H2O (H = 1, O = 16). (2 marks)
5. Distinguish between an acid and a base according to Brønsted-Lowry. (4 marks)
6. State four factors that affect the rate of a chemical reaction. (4 marks)
7. Balance the equation: H2 + O2 → H2O. (2 marks)
8. Distinguish between exothermic and endothermic reactions. (4 marks)
9. State three postulates of the kinetic molecular theory of gases. (6 marks)
SECTION B (60 MARKS)
10. (a) Describe the trends in atomic radius and ionisation energy across a period and down a group of the periodic table. (18 marks)
    (b) Explain the reasons for these trends. (12 marks)
11. Discuss the properties of acids and bases and explain how pH is measured and used. (30 marks)
12. (a) Explain Le Chatelier's principle using the Haber process as an example. (15 marks)
    (b) Describe the gas laws of Boyle and Charles. (15 marks)`,
    keyText: `1. (a) Element: a substance made of only one kind of atom that cannot be broken down chemically. (b) Compound: a substance made of two or more elements chemically combined in a fixed ratio. (c) Mole: the amount of substance containing 6.022 × 10^23 particles (Avogadro's number).
2. Ionic: transfer of electrons from a metal to a non-metal, forming oppositely charged ions held by electrostatic attraction. Covalent: sharing of electron pairs between non-metal atoms.
3. Proton (+1), neutron (0), electron (−1).
4. 2(1) + 16 = 18 g/mol.
5. Acid: a proton (H+) donor. Base: a proton acceptor.
6. Any four: concentration; temperature; surface area; catalyst; pressure (for gases); nature of reactants.
7. 2H2 + O2 → 2H2O.
8. Exothermic: releases heat to the surroundings (ΔH negative), e.g. combustion. Endothermic: absorbs heat (ΔH positive), e.g. photosynthesis.
9. Any three: gases are particles in constant random motion; particle volume is negligible compared with the container; no attractive or repulsive forces; collisions are elastic; average kinetic energy is proportional to absolute temperature.
10. (a) Across a period: atomic radius decreases, ionisation energy increases. Down a group: radius increases, ionisation energy decreases. (b) Across: more protons, greater effective nuclear charge, same shell. Down: more shells, more shielding, outer electrons further from the nucleus.
11. Acids: sour, turn blue litmus red, react with metals and carbonates, pH < 7. Bases: bitter, slippery, turn red litmus blue, pH > 7. pH = −log[H+]; measured with indicators, pH paper or a pH meter; neutralisation; uses in medicine (blood pH), agriculture (soil pH), industry.
12. (a) If a system at equilibrium is disturbed, it shifts to oppose the change. N2 + 3H2 ⇌ 2NH3 (exothermic): high pressure favours ammonia (fewer moles of gas); lower temperature favours ammonia but is slow, so a compromise temperature and an iron catalyst are used; removing ammonia shifts equilibrium right. (b) Boyle: at constant temperature, pressure is inversely proportional to volume (P1V1 = P2V2). Charles: at constant pressure, volume is directly proportional to absolute temperature (V1/T1 = V2/T2).`,
  },
  {
    key: 'economics-1',
    name: 'Principles of Microeconomics — practice paper',
    faculty: 'business',
    courseName: 'Economics',
    book: 'principles-economics-3e',
    text: `${HEAD('Principles of Microeconomics')}
SECTION A (40 MARKS)
1. Define the following terms: (a) scarcity (b) opportunity cost (c) demand (6 marks)
2. State the law of demand. (2 marks)
3. List four determinants of demand other than price. (4 marks)
4. Distinguish between a change in quantity demanded and a change in demand. (4 marks)
5. Name three factors of production and the reward for each. (6 marks)
6. Distinguish between price elasticity of demand that is elastic and inelastic, giving an example of each. (6 marks)
7. State four characteristics of a perfectly competitive market. (4 marks)
8. Distinguish between fixed costs and variable costs. (4 marks)
9. Outline what happens in a market when the price is set below equilibrium. (4 marks)
SECTION B (60 MARKS)
10. (a) With the aid of a diagram, explain how market equilibrium is reached. (18 marks)
    (b) Explain the effect of a rise in the price of fuel on the market for boda boda rides. (12 marks)
11. Discuss the advantages and disadvantages of a monopoly. (30 marks)
12. (a) Explain the reasons why governments intervene in markets. (15 marks)
    (b) Describe the effects of a price ceiling and a price floor, with examples. (15 marks)`,
    keyText: `1. (a) Scarcity: wants are unlimited but resources are limited. (b) Opportunity cost: the value of the next best alternative given up. (c) Demand: the quantity of a good consumers are willing and able to buy at each price.
2. Other things equal, as price rises the quantity demanded falls (and vice versa).
3. Any four: income; prices of related goods (substitutes and complements); tastes and preferences; population; expectations of future prices; advertising.
4. Change in quantity demanded: movement along the demand curve caused by a change in the good's own price. Change in demand: shift of the whole curve caused by other factors.
5. Land — rent; labour — wages; capital — interest; (entrepreneurship — profit).
6. Elastic (PED > 1): quantity changes more than proportionally to price, e.g. luxury goods or goods with many substitutes. Inelastic (PED < 1): quantity changes less than proportionally, e.g. salt, fuel, medicine.
7. Any four: many buyers and sellers; identical products; free entry and exit; perfect information; firms are price takers.
8. Fixed costs do not change with output (rent, salaries). Variable costs change with output (raw materials, fuel).
9. Quantity demanded exceeds quantity supplied: a shortage; queues and black markets may appear; price tends to rise back towards equilibrium.
10. (a) Demand slopes down, supply slopes up; where they cross gives equilibrium price and quantity; above equilibrium there is a surplus that pushes the price down; below it a shortage pushes the price up. (b) Higher fuel price raises costs, supply of rides decreases (shifts left), fares rise and the number of rides falls.
11. Advantages: economies of scale, funds for research and innovation, avoids wasteful duplication (natural monopoly). Disadvantages: higher prices and lower output, less choice, inefficiency, abnormal profits, exploitation of consumers. Explain each with examples.
12. (a) Market failure: public goods, externalities (pollution), information gaps, monopoly power, inequality, merit and demerit goods. (b) Price ceiling (maximum price below equilibrium) causes shortages, queues, black markets (e.g. rent control). Price floor (minimum price above equilibrium) causes surpluses (e.g. minimum wage, agricultural support prices).`,
  },
  {
    key: 'accounting-1',
    name: 'Financial Accounting I — practice paper',
    faculty: 'business',
    courseName: 'Financial Accounting',
    book: 'principles-financial-accounting',
    text: `${HEAD('Financial Accounting I')}
SECTION A (40 MARKS)
1. Define the following terms: (a) asset (b) liability (c) equity (6 marks)
2. State the accounting equation. (2 marks)
3. Name four users of financial statements and state what each wants to know. (8 marks)
4. Distinguish between the cash basis and the accrual basis of accounting. (4 marks)
5. List the three main financial statements. (6 marks)
6. Distinguish between a debit and a credit for asset accounts. (4 marks)
7. State four accounting principles or concepts. (4 marks)
8. A business buys equipment for UGX 2,000,000 in cash. Show the effect on the accounting equation. (6 marks)
SECTION B (60 MARKS)
9. Describe the steps of the accounting cycle. (30 marks)
10. Discuss the purpose of the trial balance and explain the types of errors it does not reveal. (30 marks)
11. With the aid of examples, explain depreciation and describe the straight-line method. (30 marks)
12. (a) Explain the importance of internal controls over cash. (15 marks)
    (b) Describe how a bank reconciliation is prepared. (15 marks)`,
    keyText: `1. (a) Asset: a resource owned or controlled by the business that is expected to bring future benefit. (b) Liability: an amount the business owes to others. (c) Equity: the owner's claim on the assets after liabilities are deducted.
2. Assets = Liabilities + Equity.
3. Any four with need: owners/investors (profitability, return); lenders (ability to repay); managers (decisions, control); employees (job security); government/tax authority (tax due); suppliers (creditworthiness); customers.
4. Cash basis records revenue and expenses when cash is received or paid. Accrual basis records them when earned or incurred, regardless of cash.
5. Income statement; statement of owner's equity (retained earnings); balance sheet (statement of financial position); also the statement of cash flows.
6. For asset accounts a debit increases the balance and a credit decreases it.
7. Any four: going concern; revenue recognition; expense recognition (matching); cost principle; monetary unit; separate entity; consistency; conservatism; materiality.
8. Equipment (asset) increases by 2,000,000; cash (asset) decreases by 2,000,000; total assets unchanged; liabilities and equity unchanged.
9. Identify and analyse transactions; record in the journal; post to the ledger; prepare an unadjusted trial balance; journalise and post adjusting entries; adjusted trial balance; prepare financial statements; closing entries; post-closing trial balance.
10. Purpose: checks that total debits equal total credits; helps prepare financial statements; finds some arithmetic errors. Errors not revealed: omission; commission (wrong account of the same type); principle (wrong class of account); original entry (wrong amount on both sides); complete reversal; compensating errors.
11. Depreciation: spreading the cost of a long-term asset over its useful life (matching). Straight-line: (cost − residual value) ÷ useful life, the same each year; e.g. a vehicle costing 40,000,000 with residual value 4,000,000 over 6 years = 6,000,000 per year. Journal: debit depreciation expense, credit accumulated depreciation.
12. (a) Cash is easily stolen; controls prevent theft and errors: separation of duties, authorisation, daily banking, receipts, petty cash imprest, regular reconciliation, physical security. (b) Start with the bank statement balance and the cash book balance; adjust the bank side for deposits in transit and outstanding cheques; adjust the book side for bank charges, interest, direct deposits, dishonoured cheques and errors; both adjusted balances must agree; record the book-side adjustments in the journal.`,
  },
  {
    key: 'business-1',
    name: 'Introduction to Business and Management — practice paper',
    faculty: 'business',
    courseName: 'Introduction to Business',
    book: 'introduction-business-2e',
    text: `${HEAD('Introduction to Business and Management')}
SECTION A (40 MARKS)
1. Define the following terms: (a) business (b) profit (c) entrepreneur (6 marks)
2. Name four forms of business ownership. (4 marks)
3. Distinguish between a sole proprietorship and a partnership. (6 marks)
4. State the four functions of management. (4 marks)
5. Outline four elements of a SWOT analysis. (4 marks)
6. Distinguish between a mission statement and a vision statement. (4 marks)
7. State four sources of finance for a small business in Uganda. (4 marks)
8. List four characteristics of a successful entrepreneur. (4 marks)
9. Distinguish between leadership and management. (4 marks)
SECTION B (60 MARKS)
10. Describe the factors in the external environment that affect a business. (30 marks)
11. Discuss the advantages and disadvantages of forming a limited liability company. (30 marks)
12. (a) Explain the theories of motivation of Maslow and Herzberg. (15 marks)
    (b) Describe the role of corporate social responsibility in business. (15 marks)`,
    keyText: `1. (a) Business: an organisation that provides goods or services to earn profit. (b) Profit: revenue minus expenses. (c) Entrepreneur: a person who takes the risk of starting and running a business.
2. Sole proprietorship; partnership; limited company (private or public); cooperative; (franchise, state enterprise).
3. Sole proprietorship: one owner, unlimited liability, full control and all profit, limited capital. Partnership: two or more owners, share profits and decisions, more capital and skills, unlimited liability (general partners), possible disagreements.
4. Planning; organising; leading (directing); controlling.
5. Strengths and weaknesses (internal); opportunities and threats (external).
6. Mission: why the organisation exists now, what it does and for whom. Vision: what it wants to become in the future.
7. Any four: personal savings; family and friends; bank loans; SACCOs and microfinance; grants; trade credit; equity investors.
8. Any four: risk-taking; creativity and innovation; self-confidence; hard work; persistence; vision; good with people.
9. Leadership: influencing and inspiring people towards goals. Management: planning, organising and controlling resources to achieve goals.
10. PESTLE: political (government stability, policy), economic (inflation, interest and exchange rates), social (culture, population), technological (internet, mobile money), legal (laws, licences, taxes), environmental (climate, regulations); plus competitors, suppliers and customers.
11. Advantages: limited liability; separate legal entity; continuity; easier to raise capital; credibility. Disadvantages: costly and slow to form; legal requirements and disclosure; double taxation; possible loss of control; conflicts between owners and managers.
12. (a) Maslow: physiological, safety, social, esteem, self-actualisation; managers meet needs at each level. Herzberg: hygiene factors (pay, conditions) prevent dissatisfaction; motivators (achievement, recognition, responsibility) create satisfaction. (b) Responsibilities to employees, customers, community and environment; benefits: reputation, loyalty, staff motivation, sustainability; examples.`,
  },
  {
    key: 'marketing-1',
    name: 'Principles of Marketing — practice paper',
    faculty: 'business',
    courseName: 'Marketing',
    book: 'principles-marketing',
    text: `${HEAD('Principles of Marketing')}
SECTION A (40 MARKS)
1. Define marketing. (2 marks)
2. Name the four Ps of the marketing mix. (4 marks)
3. Distinguish between needs and wants. (4 marks)
4. State four bases for segmenting a consumer market. (4 marks)
5. List the stages of the product life cycle. (4 marks)
6. Distinguish between a product and a service, giving two characteristics of services. (6 marks)
7. State four methods of promotion. (4 marks)
8. Outline the steps of the consumer buying decision process. (6 marks)
9. Distinguish between market penetration pricing and price skimming. (6 marks)
SECTION B (60 MARKS)
10. Explain how a business can use segmentation, targeting and positioning to launch a new product. (30 marks)
11. Discuss the role of digital and social media marketing for small businesses in East Africa. (30 marks)
12. (a) Describe the marketing strategies suitable for each stage of the product life cycle. (15 marks)
    (b) Explain the importance of marketing research. (15 marks)`,
    keyText: `1. The process of creating, communicating and delivering value to customers and managing relationships in ways that benefit the organisation and its customers.
2. Product; price; place; promotion.
3. Needs: basic requirements for survival (food, shelter). Wants: the particular ways people choose to satisfy needs, shaped by culture and personality.
4. Geographic; demographic; psychographic; behavioural.
5. Introduction; growth; maturity; decline.
6. A product is tangible; a service is an activity. Any two characteristics of services: intangibility, inseparability, variability, perishability.
7. Any four: advertising; personal selling; sales promotion; public relations; direct and digital marketing.
8. Need recognition; information search; evaluation of alternatives; purchase decision; post-purchase behaviour.
9. Penetration: low starting price to gain market share quickly. Skimming: high starting price for early adopters, lowered over time.
10. Segment the market by relevant bases; evaluate segments (size, growth, fit) and choose targets; position with a clear value proposition against competitors; design the marketing mix for the target; use an example.
11. Low cost, wide reach (WhatsApp, Facebook, Instagram, TikTok), targeting, two-way engagement, measurable results, mobile money integration, influencers; challenges: internet costs, skills, fake reviews, negative comments; tips for use.
12. (a) Introduction: build awareness, possible high price or penetration. Growth: expand distribution and features. Maturity: differentiate, defend share, promotions. Decline: harvest, reduce costs, reposition or withdraw. (b) Understand customers and competitors, reduce risk, identify opportunities, test products and prices, measure satisfaction and performance.`,
  },
  {
    key: 'business-law-1',
    name: 'Business Law (Contract and Tort) — practice paper',
    faculty: 'law',
    courseName: 'Business Law',
    book: 'business-law-i-essentials-2e',
    text: `${HEAD('Business Law: Contract and Tort')}
SECTION A (40 MARKS)
1. Define a contract. (2 marks)
2. Name the essential elements of a valid contract. (6 marks)
3. Distinguish between an offer and an invitation to treat, giving an example of each. (6 marks)
4. State four ways in which an offer may come to an end. (4 marks)
5. Distinguish between void and voidable contracts. (4 marks)
6. Define a tort and give two examples. (6 marks)
7. State the elements a claimant must prove in the tort of negligence. (6 marks)
8. List three remedies for breach of contract. (6 marks)
SECTION B (60 MARKS)
9. Explain the rules governing acceptance of an offer. (30 marks)
10. Discuss the capacity of minors and persons of unsound mind to enter into contracts. (30 marks)
11. With the aid of decided cases or examples, explain the defences available in the tort of negligence. (30 marks)
12. (a) Explain the doctrine of consideration. (15 marks)
    (b) Describe the circumstances in which a contract may be discharged. (15 marks)`,
    keyText: `1. A legally enforceable agreement between two or more parties.
2. Offer; acceptance; consideration; intention to create legal relations; capacity; legality of object (and free consent / certainty).
3. Offer: a definite promise to be bound on specific terms, which becomes a contract once accepted (e.g. a written offer to sell a car for a stated price). Invitation to treat: an invitation to make offers (e.g. goods displayed in a shop, adverts, price lists).
4. Any four: acceptance; rejection; counter-offer; revocation before acceptance; lapse of time; death or incapacity; failure of a condition.
5. Void: no legal effect from the beginning (e.g. illegal agreements). Voidable: valid until one party chooses to set it aside (e.g. induced by misrepresentation or undue influence).
6. A civil wrong, other than a breach of contract, for which the law gives a remedy, usually damages. Examples: negligence; trespass; defamation; nuisance.
7. A duty of care owed to the claimant; breach of that duty; damage caused by the breach (causation and loss that is not too remote).
8. Any three: damages; specific performance; injunction; rescission; quantum meruit.
9. Acceptance must be unconditional and match the offer exactly (mirror image); must be communicated to the offeror (silence is not acceptance); made by the offeree or an authorised person; in the prescribed method; postal rule — acceptance complete when posted; made while the offer is still open.
10. Minors are generally not bound, except for contracts for necessaries and beneficial contracts of service; some contracts voidable; persons of unsound mind or drunk persons may avoid contracts if the other party knew of their condition; liability for necessaries at a reasonable price; explain the reasons (protection of vulnerable persons).
11. Contributory negligence (reduces damages); volenti non fit injuria (voluntary assumption of risk); act of God / inevitable accident; necessity; statutory authority; illegality; credit relevant cases or examples.
12. (a) Something of value given in exchange for a promise; must be sufficient but need not be adequate; must not be past; must move from the promisee; existing duty is generally not good consideration. (b) Performance; agreement; frustration (impossibility); breach (actual or anticipatory); operation of law (e.g. bankruptcy, lapse of time).`,
  },
  {
    key: 'python-1',
    name: 'Introduction to Programming with Python — practice paper',
    faculty: 'computing',
    courseName: 'Python Programming',
    book: 'introduction-python-programming',
    text: `${HEAD('Introduction to Programming with Python')}
SECTION A (40 MARKS)
1. Define the following terms: (a) variable (b) algorithm (c) function (6 marks)
2. Name four built-in data types in Python. (4 marks)
3. Distinguish between a list and a tuple. (4 marks)
4. State the output of: print(7 // 2, 7 % 2) (2 marks)
5. Distinguish between a for loop and a while loop. (4 marks)
6. Write a Python expression that checks whether a number n is even. (2 marks)
7. State four rules for naming variables in Python. (4 marks)
8. Distinguish between a syntax error and a logic error. (4 marks)
9. Explain what a dictionary is and give an example. (4 marks)
10. Name three comparison operators and three logical operators. (6 marks)
SECTION B (60 MARKS)
11. (a) Write a function that takes a list of marks and returns the average. (20 marks)
    (b) Explain how your function handles an empty list. (10 marks)
12. Discuss the importance of functions in programming and explain parameters, return values and scope. (30 marks)
13. (a) Explain how exceptions are handled in Python using try and except, with an example. (15 marks)
    (b) Describe how to read data from a text file and count the number of lines. (15 marks)`,
    keyText: `1. (a) Variable: a named location that stores a value. (b) Algorithm: a step-by-step procedure for solving a problem. (c) Function: a named block of code that performs a task and can be reused.
2. Any four: int; float; str; bool; list; tuple; dict; set.
3. A list is mutable (can be changed) and written with square brackets; a tuple is immutable and written with round brackets.
4. 3 1
5. A for loop repeats over a sequence or a known number of times; a while loop repeats as long as a condition is true.
6. n % 2 == 0
7. Any four: start with a letter or underscore; only letters, digits and underscores; no spaces; case-sensitive; not a keyword such as if or for.
8. Syntax error: breaks the rules of the language, so the program will not run. Logic error: the program runs but gives the wrong result.
9. A collection of key-value pairs, e.g. ages = {"Amina": 21, "Brian": 23}; values are looked up by key.
10. Comparison: ==, !=, <, >, <=, >=. Logical: and, or, not.
11. (a) def average(marks): if not marks: return 0 (or None); return sum(marks) / len(marks). Marks for def, parameter, sum, len, return. (b) Checking for an empty list avoids ZeroDivisionError; returns 0 or None or raises a clear error.
12. Functions avoid repetition, organise code, make testing and reading easier, support teamwork; parameters receive inputs; return sends a result back; local variables exist only inside the function; global scope; examples.
13. (a) Code that may fail goes in try; except catches a specific error such as ValueError or ZeroDivisionError; optional else and finally; example converting input to int. (b) with open("file.txt") as f: count = 0; for line in f: count += 1 — or len(f.readlines()); the with statement closes the file.`,
  },
  {
    key: 'physics-1',
    name: 'Engineering Physics: Mechanics — practice paper',
    faculty: 'engineering',
    courseName: 'Physics (Mechanics)',
    book: 'university-physics-volume-1',
    text: `${HEAD('Engineering Physics: Mechanics', '3 HOURS')}
SECTION A (40 MARKS)
1. Define the following terms: (a) displacement (b) velocity (c) acceleration (6 marks)
2. Distinguish between scalar and vector quantities, giving two examples of each. (6 marks)
3. State Newton's three laws of motion. (6 marks)
4. A car accelerates uniformly from rest to 20 m/s in 5 s. Calculate its acceleration. (4 marks)
5. State the principle of conservation of energy. (2 marks)
6. Distinguish between kinetic energy and potential energy. (4 marks)
7. Define momentum and state its SI unit. (4 marks)
8. State the conditions for a body to be in equilibrium. (4 marks)
9. Calculate the work done when a force of 50 N moves an object 3 m in the direction of the force. (4 marks)
SECTION B (60 MARKS)
10. (a) Derive the equation v^2 = u^2 + 2as for uniformly accelerated motion. (18 marks)
    (b) A stone is dropped from a height of 45 m. Calculate the time it takes to reach the ground (g = 10 m/s^2). (12 marks)
11. Discuss the principle of conservation of linear momentum and its application to elastic and inelastic collisions. (30 marks)
12. (a) Explain friction, its advantages and disadvantages, and ways of reducing it in machines. (15 marks)
    (b) Describe uniform circular motion and derive the expression for centripetal acceleration. (15 marks)`,
    keyText: `1. (a) Displacement: distance moved in a stated direction (vector). (b) Velocity: rate of change of displacement. (c) Acceleration: rate of change of velocity.
2. Scalars have magnitude only (mass, speed, energy, time). Vectors have magnitude and direction (force, velocity, displacement, momentum).
3. First: a body stays at rest or moves with constant velocity unless a net external force acts. Second: the net force equals the rate of change of momentum, F = ma. Third: for every action there is an equal and opposite reaction.
4. a = (v − u)/t = (20 − 0)/5 = 4 m/s^2.
5. Energy cannot be created or destroyed, only changed from one form to another; the total energy of an isolated system is constant.
6. Kinetic energy is energy due to motion (½mv^2). Potential energy is stored energy due to position or condition (mgh, elastic).
7. Momentum = mass × velocity; unit kg m/s (N s).
8. The resultant force is zero and the resultant moment (torque) about any point is zero.
9. W = F × d = 50 × 3 = 150 J.
10. (a) v = u + at and s = ((u + v)/2) t; eliminate t: t = (v − u)/a, so s = (u + v)(v − u)/(2a), giving v^2 = u^2 + 2as. (b) s = ut + ½gt^2, 45 = 0 + 5t^2, t^2 = 9, t = 3 s.
11. In an isolated system total momentum before a collision equals total momentum after. Elastic collisions conserve kinetic energy as well; inelastic collisions lose kinetic energy (heat, sound, deformation); perfectly inelastic bodies stick together. Applications: rockets, guns' recoil, car crashes, sports; worked example.
12. (a) Friction opposes relative motion between surfaces; static and kinetic; advantages: walking, braking, gripping; disadvantages: wear, heat, energy loss; reduce by lubrication, ball bearings, streamlining, polishing. (b) Constant speed in a circle with changing direction; acceleration towards the centre a = v^2/r (from similar triangles of velocity and position vectors); centripetal force F = mv^2/r.`,
  },
  {
    key: 'sociology-1',
    name: 'Introduction to Sociology — practice paper',
    faculty: 'humanities',
    courseName: 'Sociology',
    book: 'introduction-sociology-3e',
    text: `${HEAD('Introduction to Sociology')}
SECTION A (40 MARKS)
1. Define sociology. (2 marks)
2. Name three major theoretical perspectives in sociology. (6 marks)
3. Distinguish between culture and society. (4 marks)
4. State four agents of socialisation. (4 marks)
5. Distinguish between a primary group and a secondary group. (4 marks)
6. Define social stratification and give two examples of how it appears in society. (6 marks)
7. Distinguish between norms and values. (4 marks)
8. State four functions of the family. (4 marks)
9. Outline the difference between deviance and crime. (6 marks)
SECTION B (60 MARKS)
10. Explain the functionalist and conflict views of education. (30 marks)
11. Discuss the causes and effects of rural–urban migration in East Africa. (30 marks)
12. (a) Describe the research methods used by sociologists. (15 marks)
    (b) Explain how globalisation affects culture. (15 marks)`,
    keyText: `1. The systematic study of society, social relationships and human behaviour in groups.
2. Functionalism; conflict theory; symbolic interactionism (2 marks each with a short description).
3. Culture: the shared beliefs, values, practices and material objects of a group. Society: people who live in a defined area and share a culture.
4. Any four: family; school; peers; mass media; religion; workplace.
5. Primary group: small, personal, long-lasting relationships (family, close friends). Secondary group: larger, impersonal, goal-oriented (workplace, class).
6. The ranking of people in a hierarchy based on wealth, power and prestige; examples: social class, caste, income inequality, gender inequality.
7. Norms: rules for behaviour in a society. Values: shared ideas about what is good, right and desirable.
8. Any four: reproduction; socialisation of children; economic support; emotional support; regulation of sexual behaviour; social placement.
9. Deviance: behaviour that breaks social norms (may be formal or informal). Crime: deviance that breaks formal laws and is punished by the state; all crime is deviance but not all deviance is crime.
10. Functionalist: education transmits culture, socialises, sorts people into roles, builds social cohesion. Conflict: education reproduces inequality, unequal access and resources, hidden curriculum, credentialism.
11. Causes: push factors (poverty, lack of land and jobs, poor services) and pull factors (jobs, education, health care, city life). Effects: on towns (slums, unemployment, pressure on services, crime) and on rural areas (labour loss, remittances, ageing population); credit East African examples.
12. (a) Surveys and questionnaires; interviews; participant observation; experiments; secondary data and content analysis; strengths and weaknesses. (b) Spread of ideas, media and products; cultural diffusion and hybridity; homogenisation and loss of local cultures; resistance and revival; examples.`,
  },
  {
    key: 'education-1',
    name: 'Foundations of Education and Educational Psychology — practice paper',
    faculty: 'education',
    courseName: 'Foundations of Education',
    text: `${HEAD('Foundations of Education and Educational Psychology')}
SECTION A (40 MARKS)
1. Define the following terms: (a) education (b) curriculum (c) pedagogy (6 marks)
2. Distinguish between formal, non-formal and informal education. (6 marks)
3. State four aims of education. (4 marks)
4. Name the levels of Bloom's taxonomy of the cognitive domain. (6 marks)
5. Distinguish between formative and summative assessment. (4 marks)
6. State four qualities of a good teacher. (4 marks)
7. Outline four principles of learning. (4 marks)
8. Distinguish between intrinsic and extrinsic motivation. (6 marks)
SECTION B (60 MARKS)
9. Explain the learner-centred approach to teaching and its benefits. (30 marks)
10. Discuss the contribution of Piaget's theory of cognitive development to classroom teaching. (30 marks)
11. With the aid of examples, explain the factors that affect learning. (30 marks)
12. (a) Describe the methods of classroom management. (15 marks)
    (b) Explain the role of assessment in improving learning. (15 marks)`,
    keyText: `1. (a) Education: the process of developing knowledge, skills, values and attitudes. (b) Curriculum: the planned learning experiences, content and outcomes of a course or school. (c) Pedagogy: the methods and practice of teaching.
2. Formal: structured, in schools, leads to certificates. Non-formal: organised learning outside the school system (adult literacy, workshops). Informal: lifelong learning from daily experience, family and media.
3. Any four: develop the individual's potential; prepare for work; transmit culture; build good citizens; promote national unity and development; develop moral values.
4. Remember; understand; apply; analyse; evaluate; create (original: knowledge, comprehension, application, analysis, synthesis, evaluation).
5. Formative: during learning, to give feedback and improve teaching. Summative: at the end, to grade or certify achievement.
6. Any four: knowledge of the subject; good communication; patience; fairness; preparation; care for learners; creativity.
7. Any four: readiness; exercise/practice; effect (reward); active involvement; meaningfulness; feedback; from known to unknown.
8. Intrinsic: from inside, interest or enjoyment of the task. Extrinsic: from outside, rewards, marks or praise.
9. Learners participate actively; teacher as facilitator; group work, discussion, projects; builds understanding, critical thinking, confidence and independence; caters for different abilities.
10. Stages (sensorimotor, preoperational, concrete operational, formal operational); readiness and matching tasks to the stage; use of concrete materials; discovery learning; schemas, assimilation and accommodation; implications for each level of school.
11. Learner factors (intelligence, motivation, health, prior knowledge); teacher factors (methods, attitude); environment (class size, resources, home); curriculum and materials; examples.
12. (a) Clear rules and routines; positive relationships; engaging lessons; seating arrangements; praise and consistent consequences; preventing rather than punishing. (b) Shows what learners know; feedback to learners and teacher; guides re-teaching; motivates; informs parents; improves the curriculum.`,
  },
  {
    key: 'agriculture-1',
    name: 'Introduction to Crop and Soil Science — practice paper',
    faculty: 'agriculture',
    courseName: 'Crop and Soil Science',
    text: `${HEAD('Introduction to Crop and Soil Science')}
SECTION A (40 MARKS)
1. Define the following terms: (a) soil (b) soil fertility (c) crop rotation (6 marks)
2. Name the four main components of soil. (4 marks)
3. State three macronutrients needed by plants and a deficiency sign of each. (6 marks)
4. Distinguish between organic and inorganic fertilisers. (4 marks)
5. List four causes of soil erosion. (4 marks)
6. Distinguish between sandy soil and clay soil. (6 marks)
7. State four methods of controlling crop pests. (4 marks)
8. Outline the importance of soil pH to crop production. (6 marks)
SECTION B (60 MARKS)
9. Describe the methods of soil and water conservation used on hilly farms. (30 marks)
10. Discuss the advantages and disadvantages of using inorganic fertilisers. (30 marks)
11. With the aid of examples, explain integrated pest management. (30 marks)
12. (a) Explain the benefits of crop rotation. (15 marks)
    (b) Describe the factors to consider when selecting a site for a vegetable garden. (15 marks)`,
    keyText: `1. (a) Soil: the loose upper layer of the earth's surface in which plants grow, made of minerals, organic matter, water and air. (b) Soil fertility: the ability of soil to supply nutrients in the right amounts for plant growth. (c) Crop rotation: growing different crops in sequence on the same piece of land.
2. Mineral matter; organic matter (humus); water; air (plus living organisms).
3. Nitrogen — yellowing of older leaves, stunted growth; phosphorus — purplish leaves, poor roots; potassium — scorched or yellow leaf edges, weak stems.
4. Organic: from plant or animal materials (manure, compost); release nutrients slowly and improve soil structure. Inorganic: manufactured chemicals (urea, NPK, DAP); concentrated and fast-acting.
5. Any four: heavy rain and runoff; wind; overgrazing; deforestation; ploughing up and down slopes; bush burning.
6. Sandy: large particles, drains quickly, poor water and nutrient holding, well aerated, easy to work. Clay: very fine particles, holds water and nutrients, poorly drained, sticky when wet and hard when dry.
7. Any four: cultural (rotation, timely planting); biological (natural enemies); chemical (pesticides); mechanical (hand-picking, traps); resistant varieties; legislative (quarantine).
8. pH affects nutrient availability; most crops prefer slightly acidic to neutral (about 6–7); very acidic soils lock up phosphorus and release toxic aluminium; liming raises pH; affects microorganisms.
9. Terracing; contour ploughing and bunds; strip cropping; cover crops and mulching; agroforestry and planting grass strips; cut-off drains; gabions; avoid burning.
10. Advantages: quick nutrient supply, higher yields, easy to transport and apply, exact nutrient content. Disadvantages: costly, can acidify soil, pollution of water when washed off, do not improve soil structure, can burn crops if misused.
11. Combining methods to keep pests below damaging levels with minimal harm: monitoring and scouting, cultural, biological, mechanical and resistant varieties, chemicals only when needed and safely; examples such as push–pull for stemborers in maize.
12. (a) Breaks pest and disease cycles; maintains soil fertility (legumes fix nitrogen); uses nutrients from different depths; controls weeds; reduces erosion; spreads risk. (b) Water supply; soil type and fertility; sunlight; drainage and slope; nearness to the home and market; security; previous use of the land.`,
  },
];
