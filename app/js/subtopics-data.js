/* Subtopic taxonomy — ported VERBATIM from the legacy Flask app (obs_app.py SUBTOPICS).

   The legacy app curated a fixed subtopic list per subject: 5 for grades 1-5 and 10 for
   grades 6-7, each with a name, description, FontAwesome icon and Bootstrap colour. It could do
   that because questions were generated on demand by an LLM, so the subtopic was only a
   prompt hint and never had to match stored content.

   The static site has no runtime LLM, so authored questions are MAPPED onto this taxonomy
   instead (see subtopic-map.js). This file is the taxonomy; that file is the mapping.

   Generated from obs_app.py rather than retyped, so names, descriptions, icons and colours
   cannot drift. geography and history are omitted: those subjects were dropped from scope.

   OWNER-APPROVED DIVERGENCE (2026-08-31): grades 1-5 math gains `algebraic_concepts` and
   `financial_literacy`. Roughly 50 authored questions map to no legacy bucket at those
   grades. `algebraic_concepts` is the legacy grade-6 entry reused verbatim.
   `financial_literacy` has no legacy math entry: its icon comes from the legacy history
   subtopic `economic_systems_financial_literacy` (fa-dollar-sign) and its colour is the one
   palette value grades 1-5 math was not already using. Its name and description are the only
   text here NOT taken from the legacy app. */

export const SUBTOPICS = {
  math: {
    grades_5_and_below: [
      { id: 'number_sense_basic_operations', name: 'Number Sense & Basic Operations',
        description: 'Understanding numbers, place value, addition, subtraction, multiplication, and division',
        icon: 'fa-sort-numeric-up', color: 'primary' },
      { id: 'fractions_decimals', name: 'Fractions & Decimals',
        description: 'Introduction to fractions, equivalent fractions, comparing fractions, decimal concepts, and simple operations with both',
        icon: 'fa-divide', color: 'success' },
      { id: 'geometry_spatial_concepts', name: 'Geometry & Spatial Concepts',
        description: 'Basic shapes, symmetry, patterns, area, perimeter, and simple volume measurements',
        icon: 'fa-shapes', color: 'info' },
      { id: 'measurement_data', name: 'Measurement & Data',
        description: 'Units of measurement (length, weight, capacity, time), collecting and representing data, simple graphs and charts',
        icon: 'fa-ruler', color: 'warning' },
      { id: 'problem_solving_applications', name: 'Problem Solving & Applications',
        description: 'Multi-step word problems, mathematical reasoning, patterns, and practical applications of math concepts',
        icon: 'fa-lightbulb', color: 'danger' },
      { id: 'algebraic_concepts', name: 'Algebraic Concepts',
        description: 'Variables, expressions, equations, inequalities, functions, and algebraic reasoning',
        icon: 'fa-calculator', color: 'secondary' },
      { id: 'financial_literacy', name: 'Financial Literacy',
        description: 'Earning and spending, income and expenses, saving and budgeting, and money word problems',
        icon: 'fa-dollar-sign', color: 'dark' },
    ],
    grades_above_5: [
      { id: 'number_sense_basic_operations', name: 'Number Sense & Basic Operations',
        description: 'Understanding numbers, place value, addition, subtraction, multiplication, and division',
        icon: 'fa-sort-numeric-up', color: 'primary' },
      { id: 'fractions_decimals', name: 'Fractions & Decimals',
        description: 'Introduction to fractions, equivalent fractions, comparing fractions, decimal concepts, and simple operations with both',
        icon: 'fa-divide', color: 'success' },
      { id: 'geometry_spatial_concepts', name: 'Geometry & Spatial Concepts',
        description: 'Basic shapes, symmetry, patterns, area, perimeter, and simple volume measurements',
        icon: 'fa-shapes', color: 'info' },
      { id: 'measurement_data', name: 'Measurement & Data',
        description: 'Units of measurement (length, weight, capacity, time), collecting and representing data, simple graphs and charts',
        icon: 'fa-ruler', color: 'warning' },
      { id: 'problem_solving_applications', name: 'Problem Solving & Applications',
        description: 'Multi-step word problems, mathematical reasoning, patterns, and practical applications of math concepts',
        icon: 'fa-lightbulb', color: 'danger' },
      { id: 'advanced_number_systems', name: 'Advanced Number Systems',
        description: 'Integers, rational and irrational numbers, number properties, and operations across number systems',
        icon: 'fa-infinity', color: 'dark' },
      { id: 'algebraic_concepts', name: 'Algebraic Concepts',
        description: 'Variables, expressions, equations, inequalities, functions, and algebraic reasoning',
        icon: 'fa-calculator', color: 'secondary' },
      { id: 'proportional_reasoning_percentages', name: 'Proportional Reasoning & Percentages',
        description: 'Ratios, rates, proportions, percent problems, and applications',
        icon: 'fa-percentage', color: 'primary' },
      { id: 'advanced_geometry_measurement', name: 'Advanced Geometry & Measurement',
        description: 'Area, perimeter, and volume of complex 2D and 3D figures, coordinate geometry, transformations',
        icon: 'fa-cube', color: 'success' },
      { id: 'data_analysis_functions', name: 'Data Analysis & Functions',
        description: 'Statistical concepts, graphs, data representations, function types (linear, quadratic, exponential), and mathematical modeling',
        icon: 'fa-chart-line', color: 'info' },
    ],
  },
  english: {
    grades_5_and_below: [
      { id: 'reading_fundamentals', name: 'Reading Fundamentals',
        description: 'Reading comprehension, author\'s purpose and tone, text structure, story elements, poetry features, and basic literary analysis',
        icon: 'fa-book-open', color: 'primary' },
      { id: 'writing_essentials', name: 'Writing Essentials',
        description: 'Organizing ideas, developing arguments, crafting introductions and conclusions, descriptive writing, research skills, and summarizing',
        icon: 'fa-pen', color: 'success' },
      { id: 'vocabulary_building', name: 'Vocabulary Building',
        description: 'Prefixes and suffixes, synonyms and antonyms, analogies, idioms and adages, Greek and Latin roots, homophones and homonyms',
        icon: 'fa-spell-check', color: 'info' },
      { id: 'grammar_language_mechanics', name: 'Grammar & Language Mechanics',
        description: 'Parts of speech (nouns, verbs, pronouns, adjectives, adverbs), subject-verb agreement, contractions, prepositions, and sentence structure',
        icon: 'fa-language', color: 'warning' },
      { id: 'written_conventions', name: 'Written Conventions',
        description: 'Spelling, capitalization, formatting, abbreviations, basic punctuation, and editing skills',
        icon: 'fa-edit', color: 'danger' },
    ],
    grades_above_5: [
      { id: 'reading_fundamentals', name: 'Reading Fundamentals',
        description: 'Reading comprehension, author\'s purpose and tone, text structure, story elements, poetry features, and basic literary analysis',
        icon: 'fa-book-open', color: 'primary' },
      { id: 'writing_essentials', name: 'Writing Essentials',
        description: 'Organizing ideas, developing arguments, crafting introductions and conclusions, descriptive writing, research skills, and summarizing',
        icon: 'fa-pen', color: 'success' },
      { id: 'vocabulary_building', name: 'Vocabulary Building',
        description: 'Prefixes and suffixes, synonyms and antonyms, analogies, idioms and adages, Greek and Latin roots, homophones and homonyms',
        icon: 'fa-spell-check', color: 'info' },
      { id: 'grammar_language_mechanics', name: 'Grammar & Language Mechanics',
        description: 'Parts of speech (nouns, verbs, pronouns, adjectives, adverbs), subject-verb agreement, contractions, prepositions, and sentence structure',
        icon: 'fa-language', color: 'warning' },
      { id: 'written_conventions', name: 'Written Conventions',
        description: 'Spelling, capitalization, formatting, abbreviations, basic punctuation, and editing skills',
        icon: 'fa-edit', color: 'danger' },
      { id: 'literary_analysis_comprehension', name: 'Literary Analysis & Comprehension',
        description: 'Analyzing literature, novel studies, nonfiction book studies, thematic development, and critical reading strategies',
        icon: 'fa-search', color: 'dark' },
      { id: 'advanced_writing_styles', name: 'Advanced Writing Styles',
        description: 'Expository writing, persuasive and opinion writing, creative writing, research papers, and rhetorical techniques',
        icon: 'fa-feather-alt', color: 'secondary' },
      { id: 'sentence_craft_structure', name: 'Sentence Craft & Structure',
        description: 'Sentences vs. fragments and run-ons, phrases and clauses, direct and indirect objects, active and passive voice, and complex sentences',
        icon: 'fa-link', color: 'primary' },
      { id: 'advanced_grammar_applications', name: 'Advanced Grammar Applications',
        description: 'Conjunctions, misplaced modifiers, complex verb tenses, advanced agreement rules, and grammatical analysis',
        icon: 'fa-cogs', color: 'success' },
      { id: 'advanced_punctuation_style', name: 'Advanced Punctuation & Style',
        description: 'Commas, semicolons, dashes, hyphens, ellipses, citation formats, style variations, and editing for publication',
        icon: 'fa-quote-right', color: 'info' },
    ],
  },
  science: {
    grades_5_and_below: [
      { id: 'physical_science_basics', name: 'Physical Science Basics',
        description: 'Materials, matter and mass, physical and chemical changes, atoms and molecules, heat and thermal energy',
        icon: 'fa-atom', color: 'primary' },
      { id: 'forces_energy', name: 'Forces & Energy',
        description: 'Force and motion, magnetism, electricity, light, simple machines, and energy basics',
        icon: 'fa-bolt', color: 'success' },
      { id: 'earth_systems', name: 'Earth Systems',
        description: 'Rocks, fossils, weather and climate, Earth\'s features, natural resources, and water cycle',
        icon: 'fa-globe', color: 'info' },
      { id: 'life_science_fundamentals', name: 'Life Science Fundamentals',
        description: 'Animals, plants, adaptations, traits and heredity, ecosystems, and basic classification',
        icon: 'fa-leaf', color: 'warning' },
      { id: 'scientific_investigation_skills', name: 'Scientific Investigation Skills',
        description: 'Units and measurement, scientific names, observation methods, basic astronomy, and simple experimentation',
        icon: 'fa-microscope', color: 'danger' },
    ],
    grades_above_5: [
      { id: 'physical_science_basics', name: 'Physical Science Basics',
        description: 'Materials, matter and mass, physical and chemical changes, atoms and molecules, heat and thermal energy',
        icon: 'fa-atom', color: 'primary' },
      { id: 'forces_energy', name: 'Forces & Energy',
        description: 'Force and motion, magnetism, electricity, light, simple machines, and energy basics',
        icon: 'fa-bolt', color: 'success' },
      { id: 'earth_systems', name: 'Earth Systems',
        description: 'Rocks, fossils, weather and climate, Earth\'s features, natural resources, and water cycle',
        icon: 'fa-globe', color: 'info' },
      { id: 'life_science_fundamentals', name: 'Life Science Fundamentals',
        description: 'Animals, plants, adaptations, traits and heredity, ecosystems, and basic classification',
        icon: 'fa-leaf', color: 'warning' },
      { id: 'scientific_investigation_skills', name: 'Scientific Investigation Skills',
        description: 'Units and measurement, scientific names, observation methods, basic astronomy, and simple experimentation',
        icon: 'fa-microscope', color: 'danger' },
      { id: 'scientific_methods_research', name: 'Scientific Methods & Research',
        description: 'Science practices and tools, designing experiments, data analysis, scientific reasoning, and technology applications',
        icon: 'fa-flask', color: 'dark' },
      { id: 'advanced_biology', name: 'Advanced Biology',
        description: 'Anatomy and physiology, cellular biology, genetics, evolution, biodiversity, and complex ecosystems',
        icon: 'fa-dna', color: 'secondary' },
      { id: 'chemistry_concepts', name: 'Chemistry Concepts',
        description: 'Biochemistry, atomic structure, chemical reactions, periodic table, solutions, and chemical equations',
        icon: 'fa-vial', color: 'primary' },
      { id: 'physics_energy_systems', name: 'Physics & Energy Systems',
        description: 'Kinetic and potential energy, waves, electricity and magnetism, motion and forces, and thermodynamics',
        icon: 'fa-wave-square', color: 'success' },
      { id: 'earth_space_science', name: 'Earth & Space Science',
        description: 'Geology, astronomy, climate systems, environmental science, natural resources, and sustainability',
        icon: 'fa-satellite', color: 'info' },
    ],
  },
};

// Legacy routing: obs_app.py picked grades_5_and_below when `grade <= 5`, else grades_above_5.
export function subtopicsForGrade(subject, grade) {
  const s = SUBTOPICS[subject];
  if (!s) return [];
  return grade <= 5 ? s.grades_5_and_below : s.grades_above_5;
}

export function subtopicById(subject, grade, id) {
  return subtopicsForGrade(subject, grade).find((s) => s.id === id) || null;
}

