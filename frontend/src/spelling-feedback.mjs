import { MAX_WORD_LENGTH, normalizeAnswer } from './learning.mjs?v=10';

const GRAPHEME_SEGMENTER_OPTIONS = { granularity: 'grapheme' };

function graphemes(text) {
  if (typeof Intl.Segmenter !== 'function') return null;
  try {
    const segmenter = new Intl.Segmenter(undefined, GRAPHEME_SEGMENTER_OPTIONS);
    return Array.from(segmenter.segment(text), ({ segment }) => segment);
  } catch {
    return null;
  }
}

function normalizeGraphemes(text, settings) {
  const source = graphemes(text);
  if (!source) return null;

  const units = [];
  for (let sourceIndex = 0; sourceIndex < source.length; sourceIndex += 1) {
    let normalized = source[sourceIndex];
    if (!settings.caseSensitive) normalized = normalized.toLowerCase();
    if (!settings.accentSensitive) {
      normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    if (!normalized) continue;
    const pieces = graphemes(normalized);
    if (!pieces || pieces.length !== 1) return null;
    units.push({ value: pieces[0], sourceIndex });
  }

  if (units.map(({ value }) => value).join('') !== normalizeAnswer(text, settings)) return null;
  return { source, units };
}

function fallback(response, expected) {
  return {
    canCompare: false,
    response: response.trim(),
    expected: expected.trim(),
    responseSegments: [{ text: response.trim(), changed: false }],
    expectedSegments: [{ text: expected.trim(), changed: false }],
    operations: [],
    summaries: ['Sammenlign stavemåtene for å finne forskjellen.'],
    summary: 'Sammenlign stavemåtene for å finne forskjellen.',
  };
}

function markSegments(source, changedIndexes) {
  const changed = new Set(changedIndexes);
  const segments = [];
  source.forEach((text, index) => {
    const previous = segments.at(-1);
    if (previous?.changed === changed.has(index)) {
      previous.text += text;
    } else {
      segments.push({ text, changed: changed.has(index) });
    }
  });
  return segments;
}

function operationText(operation, responseSource, expectedSource) {
  const displayText = (source, span) => {
    const text = source.slice(span.start, span.end).join('');
    return text.replaceAll(' ', ' mellomrom ').trim();
  };
  const position = (start, end) => (end - start > 1 ? `${start + 1}–${end}` : `${start + 1}`);
  const responseText = displayText(responseSource, operation.responseSpan);
  const expectedText = displayText(expectedSource, operation.expectedSpan);

  if (operation.type === 'substitution') {
    return `Bytt «${responseText}» med «${expectedText}» på plass ${position(
      operation.responseSpan.start,
      operation.responseSpan.end,
    )}.`;
  }
  if (operation.type === 'transposition') {
    return `Bytt rekkefølgen på «${responseText}» på plass ${position(
      operation.responseSpan.start,
      operation.responseSpan.end,
    )}.`;
  }
  if (operation.type === 'extra') {
    return `Ta bort «${responseText}» på plass ${position(
      operation.responseSpan.start,
      operation.responseSpan.end,
    )}.`;
  }

  const boundary = operation.responseSpan.start;
  const location =
    boundary === 0
      ? 'før plass 1'
      : boundary >= responseSource.length
        ? `etter plass ${responseSource.length}`
        : `etter plass ${boundary}`;
  return `Legg til «${expectedText}» ${location}.`;
}

function combineAdjacent(operations) {
  const combined = [];
  operations.forEach((operation) => {
    const previous = combined.at(-1);
    const adjacent =
      previous?.type === operation.type &&
      operation.type !== 'transposition' &&
      previous.responseSpan.end === operation.responseSpan.start &&
      previous.expectedSpan.end === operation.expectedSpan.start;
    if (adjacent) {
      previous.responseSpan.end = operation.responseSpan.end;
      previous.expectedSpan.end = operation.expectedSpan.end;
    } else {
      combined.push({
        type: operation.type,
        responseSpan: { ...operation.responseSpan },
        expectedSpan: { ...operation.expectedSpan },
      });
    }
  });
  return combined;
}

export function compareSpelling(response, expected, settings = {}) {
  if (typeof response !== 'string' || typeof expected !== 'string') {
    throw new TypeError('Svar og forventet stavemåte må være tekst.');
  }
  const submitted = response.trim();
  const answer = expected.trim();
  if (response.length > MAX_WORD_LENGTH || expected.length > MAX_WORD_LENGTH) {
    return fallback(submitted, answer);
  }
  const responseMapping = normalizeGraphemes(submitted, settings);
  const expectedMapping = normalizeGraphemes(answer, settings);
  if (!responseMapping || !expectedMapping) return fallback(submitted, answer);

  const responseUnits = responseMapping.units;
  const expectedUnits = expectedMapping.units;
  const rows = responseUnits.length + 1;
  const columns = expectedUnits.length + 1;
  const costs = Array.from({ length: rows }, () => Array(columns).fill(0));
  const choices = Array.from({ length: responseUnits.length }, () =>
    Array(expectedUnits.length).fill(null),
  );

  for (let i = responseUnits.length; i >= 0; i -= 1) {
    for (let j = expectedUnits.length; j >= 0; j -= 1) {
      if (i === responseUnits.length && j === expectedUnits.length) continue;
      if (i === responseUnits.length) {
        costs[i][j] = expectedUnits.length - j;
        continue;
      }
      if (j === expectedUnits.length) {
        costs[i][j] = responseUnits.length - i;
        continue;
      }

      const candidates = [];
      if (responseUnits[i].value === expectedUnits[j].value) {
        candidates.push({ type: 'equal', cost: costs[i + 1][j + 1] });
      } else {
        // Stable ordering resolves equal costs: equality, transposition, substitution, deletion, insertion.
        if (
          i + 1 < responseUnits.length &&
          j + 1 < expectedUnits.length &&
          responseUnits[i].value === expectedUnits[j + 1].value &&
          responseUnits[i + 1].value === expectedUnits[j].value
        ) {
          candidates.push({ type: 'transposition', cost: 1 + costs[i + 2][j + 2] });
        }
        candidates.push({ type: 'substitution', cost: 1 + costs[i + 1][j + 1] });
        candidates.push({ type: 'extra', cost: 1 + costs[i + 1][j] });
        candidates.push({ type: 'missing', cost: 1 + costs[i][j + 1] });
      }
      candidates.sort((left, right) => left.cost - right.cost);
      const chosen = candidates[0];
      costs[i][j] = chosen.cost;
      choices[i][j] = chosen.type;
    }
  }

  const edits = [];
  let responseIndex = 0;
  let expectedIndex = 0;
  while (responseIndex < responseUnits.length || expectedIndex < expectedUnits.length) {
    const choice =
      responseIndex === responseUnits.length
        ? 'missing'
        : expectedIndex === expectedUnits.length
          ? 'extra'
          : choices[responseIndex][expectedIndex];

    if (choice === 'equal') {
      responseIndex += 1;
      expectedIndex += 1;
      continue;
    }
    if (choice === 'transposition') {
      edits.push({
        type: choice,
        responseIndexes: [responseIndex, responseIndex + 1],
        expectedIndexes: [expectedIndex, expectedIndex + 1],
      });
      responseIndex += 2;
      expectedIndex += 2;
      continue;
    }
    if (choice === 'substitution') {
      edits.push({
        type: choice,
        responseIndexes: [responseIndex],
        expectedIndexes: [expectedIndex],
      });
      responseIndex += 1;
      expectedIndex += 1;
      continue;
    }
    if (choice === 'extra') {
      edits.push({
        type: choice,
        responseIndexes: [responseIndex],
        expectedIndexes: [],
        expectedBoundary: expectedIndex,
      });
      responseIndex += 1;
      continue;
    }
    edits.push({
      type: choice,
      responseIndexes: [],
      expectedIndexes: [expectedIndex],
      responseBoundary: responseIndex,
    });
    expectedIndex += 1;
  }

  const sourceBoundary = (units, boundary, sourceLength) => {
    if (boundary < units.length) return units[boundary].sourceIndex;
    return units.length ? units.at(-1).sourceIndex + 1 : sourceLength;
  };
  const operations = edits.map((edit) => {
    const responseSpan = edit.responseIndexes.length
      ? {
          start: responseUnits[edit.responseIndexes[0]].sourceIndex,
          end: responseUnits[edit.responseIndexes.at(-1)].sourceIndex + 1,
        }
      : (() => {
          const boundary = sourceBoundary(
            responseUnits,
            edit.responseBoundary,
            responseMapping.source.length,
          );
          return { start: boundary, end: boundary };
        })();
    const expectedSpan = edit.expectedIndexes.length
      ? {
          start: expectedUnits[edit.expectedIndexes[0]].sourceIndex,
          end: expectedUnits[edit.expectedIndexes.at(-1)].sourceIndex + 1,
        }
      : (() => {
          const boundary = sourceBoundary(
            expectedUnits,
            edit.expectedBoundary,
            expectedMapping.source.length,
          );
          return { start: boundary, end: boundary };
        })();
    return { type: edit.type, responseSpan, expectedSpan };
  });

  const groupedOperations = combineAdjacent(operations);
  const responseMarks = groupedOperations
    .filter(({ type }) => type !== 'missing')
    .flatMap(({ responseSpan }) =>
      Array.from(
        { length: responseSpan.end - responseSpan.start },
        (_, offset) => responseSpan.start + offset,
      ),
    );
  const expectedMarks = groupedOperations
    .filter(({ type }) => type !== 'extra')
    .flatMap(({ expectedSpan }) =>
      Array.from(
        { length: expectedSpan.end - expectedSpan.start },
        (_, offset) => expectedSpan.start + offset,
      ),
    );
  const summary = groupedOperations.map((operation) =>
    operationText(operation, responseMapping.source, expectedMapping.source),
  );

  return {
    canCompare: true,
    response: submitted,
    expected: answer,
    responseSegments: markSegments(responseMapping.source, responseMarks),
    expectedSegments: markSegments(expectedMapping.source, expectedMarks),
    operations: groupedOperations,
    summaries: summary,
    summary: summary.join(' '),
  };
}
