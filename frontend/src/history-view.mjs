import { accuracy, HISTORY_PAGE_SIZE, newestFirst, variantTrend } from './history.mjs?v=3';

const directions = {
  forward: 'Hint til svar',
  reverse: 'Svar til hint',
  mixed: 'Blandet retning',
  unknown: 'Ukjent retning',
};
const orders = { original: 'Opprinnelig rekkefølge', shuffled: 'Tilfeldig rekkefølge' };
const date = (result) => new Date(result.completedAt).toLocaleString('nb-NO');
const percent = (value) => `${Math.round(value)} %`;
const decimal = (value) =>
  value.toLocaleString('nb-NO', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
const modes = (result) =>
  `${directions[result.directionMode] ?? directions.unknown} · ${orders[result.orderMode]}`;
const settings = (result) =>
  `Store og små bokstaver: ${result.caseSensitive ? 'skilles' : 'skilles ikke'}. Aksenter: ${result.accentSensitive ? 'skilles' : 'skilles ikke'}.`;

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createHistoryView({ dialog, getProfile, getHistory }) {
  const selector = dialog.querySelector('#history-variant');
  const list = dialog.querySelector('#history-list');
  const more = dialog.querySelector('#history-more');
  let visibleCount = HISTORY_PAGE_SIZE;
  let profileId = null;
  let selectedKey = null;
  const itemCache = new Map();

  function renderTrend(history) {
    const trend = variantTrend(history, selectedKey);
    const container = dialog.querySelector('#history-trend');
    const status = dialog.querySelector('#history-status');
    container.hidden = !trend.latest;
    if (!trend.latest) {
      status.textContent = '';
      return;
    }
    const comparison =
      `Siste førsteforsøksnøyaktighet: ${percent(accuracy(trend.latest))}. ` +
      (trend.delta === null
        ? 'Fullfør en ny, sammenlignbar øving for å se endring.'
        : trend.delta === 0
          ? 'Uendret fra forrige sammenlignbare øving (0,0 prosentpoeng).'
          : `${decimal(Math.abs(trend.delta))} prosentpoeng ${trend.delta > 0 ? 'høyere' : 'lavere'} enn forrige sammenlignbare øving. Hver øving gir ny trening.`);
    const records = `Rekorder i lagret historikk for denne varianten: ${percent(trend.bestAccuracy)} på første forsøk · Beste rekke: ${trend.bestStreak}.`;
    dialog.querySelector('#history-comparison').textContent = comparison;
    dialog.querySelector('#history-records').textContent = records;
    status.textContent = `Sammenligning oppdatert. ${comparison} ${records}`;
    const svg = dialog.querySelector('#history-chart');
    svg.replaceChildren();
    function shape(tag, attributes, text) {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
      if (text !== undefined) node.textContent = text;
      svg.append(node);
      return node;
    }
    for (const value of [0, 50, 100]) {
      const y = 145 - value * 1.2;
      shape('line', { x1: 48, x2: 535, y1: y, y2: y, class: 'chart-grid' });
      shape('text', { x: 2, y: y + 4 }, `${value} %`);
    }
    const points = trend.recent.map((result, index) => ({
      x: trend.recent.length === 1 ? 290 : 65 + (index / (trend.recent.length - 1)) * 455,
      y: 145 - accuracy(result) * 1.2,
      result,
    }));
    if (points.length > 1) {
      shape('polyline', {
        points: points.map(({ x, y }) => `${x},${y}`).join(' '),
        class: 'chart-line',
        fill: 'none',
      });
    }
    points.forEach(({ x, y, result }, index) => {
      shape('circle', { cx: x, cy: y, r: 4, class: 'chart-point' });
      shape('text', { x, y: 168, 'text-anchor': 'middle' }, String(index + 1));
      shape('title', {}, `${date(result)}: ${percent(accuracy(result))}`);
    });
    const body = dialog.querySelector('#history-chart-table tbody');
    body.replaceChildren();
    trend.recent.forEach((result, index) => {
      const row = element('tr');
      row.append(
        element('td', String(index + 1)),
        element('td', date(result)),
        element('td', percent(accuracy(result))),
      );
      body.append(row);
    });
  }

  function render() {
    const profile = getProfile();
    if (profileId !== profile.id) {
      profileId = profile.id;
      visibleCount = HISTORY_PAGE_SIZE;
      selectedKey = null;
    }
    const history = newestFirst(getHistory());
    dialog.querySelector('#history-profile').textContent = `Profil: ${profile.name}`;
    dialog.querySelector('#history-empty').hidden = history.length > 0;
    const byVariant = new Map();
    for (const result of history) {
      if (!byVariant.has(result.comparisonKey)) byVariant.set(result.comparisonKey, result);
    }
    const variants = [...byVariant.values()];
    if (!variants.some(({ comparisonKey }) => comparisonKey === selectedKey)) {
      selectedKey = history[0]?.comparisonKey ?? null;
    }
    selector.replaceChildren();
    variants.forEach((result, index) => {
      const option = element(
        'option',
        `${result.setName} · ${modes(result)} · ${settings(result)} · Variant ${index + 1}`,
      );
      option.value = result.comparisonKey;
      option.selected = result.comparisonKey === selectedKey;
      selector.append(option);
    });
    dialog.querySelector('#history-variant-controls').hidden = history.length === 0;
    renderTrend(history);
    const focusedItem = document.activeElement.closest?.('#history-list > li');
    const focusedKey = focusedItem?.dataset.historyKey;
    const visibleItems = history.slice(0, visibleCount).map((result) => {
      const key = `${profile.id}:${result.id}`;
      const signature = JSON.stringify(result);
      const previous = itemCache.get(key);
      if (previous?.signature === signature) return { key, item: previous.item };
      const item = element('li');
      item.dataset.historyKey = key;
      item.append(
        element('h3', result.setName),
        element('p', date(result)),
        element('p', modes(result)),
        element(
          'p',
          `${result.points} poeng · ${result.firstTryCount}/${result.practicedCount} riktige på første forsøk (${percent(accuracy(result))}) · ${result.totalErrors} feilsvar · Beste rekke: ${result.bestStreak}`,
        ),
      );
      const details = element('details');
      details.append(
        element('summary', 'Vis øvingsdetaljer'),
        element(
          'p',
          `${result.practicedCount} øveoppføringer · ${result.extraPracticeCount} trengte mer øving.`,
        ),
        element('p', settings(result)),
      );
      item.append(details);
      if (previous) details.open = previous.item.querySelector('details').open;
      itemCache.set(key, { item, signature });
      return { key, item };
    });
    visibleItems.forEach(({ item }, index) => {
      if (list.children[index] !== item) list.insertBefore(item, list.children[index] ?? null);
    });
    while (list.children.length > visibleItems.length) list.lastElementChild.remove();
    if (focusedKey) {
      const focused = visibleItems.find(({ key }) => key === focusedKey);
      if (focused && !focused.item.contains(document.activeElement)) {
        focused.item.querySelector('summary').focus();
      }
    }
    more.hidden = history.length <= visibleCount;
  }
  selector.addEventListener('change', () => {
    selectedKey = selector.value;
    renderTrend(getHistory());
  });
  more.addEventListener('click', () => {
    const firstNew = visibleCount;
    visibleCount += HISTORY_PAGE_SIZE;
    render();
    list.children[firstNew]?.querySelector('summary').focus();
  });
  return {
    render,
    open() {
      visibleCount = HISTORY_PAGE_SIZE;
      selectedKey = null;
      render();
      dialog.showModal();
      dialog.querySelector('h2').focus();
    },
  };
}
