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
  `Store og små bokstaver ${result.caseSensitive ? 'skilles' : 'skilles ikke'} · Aksenter ${result.accentSensitive ? 'skilles' : 'skilles ikke'}`;

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function variantLabels(variants) {
  const totals = new Map();
  for (const result of variants) {
    const key = `${result.setName}\u0000${directions[result.directionMode] ?? directions.unknown}`;
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  const indexes = new Map();
  return variants.map((result) => {
    const direction = directions[result.directionMode] ?? directions.unknown;
    const key = `${result.setName}\u0000${direction}`;
    const index = (indexes.get(key) ?? 0) + 1;
    indexes.set(key, index);
    return {
      result,
      label:
        totals.get(key) > 1
          ? `${result.setName} · ${direction} · variant ${index}`
          : `${result.setName} · ${direction}`,
    };
  });
}

export function createHistoryView({ dialog, getProfile, getHistory }) {
  const selector = dialog.querySelector('#history-variant');
  const list = dialog.querySelector('#history-list');
  const more = dialog.querySelector('#history-more');
  let visibleCount = HISTORY_PAGE_SIZE;
  let profileId = null;
  let selectedKey = null;
  const itemCache = new Map();

  function renderTrend(history, announce = false) {
    const trend = variantTrend(history, selectedKey);
    const container = dialog.querySelector('#history-trend');
    const metrics = dialog.querySelector('#history-metrics');
    const status = dialog.querySelector('#history-status');
    container.hidden = !trend.latest;
    metrics.hidden = !trend.latest;
    if (!trend.latest) {
      status.textContent = '';
      return;
    }

    const latestAccuracy = accuracy(trend.latest);
    let comparison;
    let announcement;
    if (trend.delta === null) {
      comparison = 'Utgangspunkt. Fullfør en ny, sammenlignbar øving for å se endring.';
      announcement = 'Utgangspunkt for denne øvingsvarianten.';
      dialog.querySelector('#history-delta-value').textContent = '—';
      dialog.querySelector('#history-delta-detail').textContent =
        'Utgangspunkt · én øving til for trend';
    } else if (trend.delta === 0) {
      comparison = 'Uendret fra forrige sammenlignbare øving (0,0 prosentpoeng).';
      announcement = 'Uendret fra forrige sammenlignbare øving.';
      dialog.querySelector('#history-delta-value').textContent = '—';
      dialog.querySelector('#history-delta-detail').textContent =
        'Uendret fra forrige sammenlignbare øving';
    } else {
      const direction = trend.delta > 0 ? 'høyere' : 'lavere';
      comparison = `${decimal(Math.abs(trend.delta))} prosentpoeng ${direction} enn forrige sammenlignbare øving. Hver øving gir ny trening.`;
      announcement = `${decimal(Math.abs(trend.delta))} prosentpoeng ${direction} enn forrige sammenlignbare øving.`;
      dialog.querySelector('#history-delta-value').textContent =
        `${trend.delta > 0 ? '↑' : '↓'} ${decimal(Math.abs(trend.delta))} pp`;
      dialog.querySelector('#history-delta-detail').textContent =
        `${direction} enn forrige sammenlignbare øving`;
    }
    const records = `Beste førsteforsøk i lagret historikk for varianten: ${percent(trend.bestAccuracy)}. Beste rekke: ${trend.bestStreak} riktige svar på rad i én øving.`;
    dialog.querySelector('#history-latest-value').textContent = percent(latestAccuracy);
    dialog.querySelector('#history-latest-detail').textContent =
      `${trend.latest.firstTryCount}/${trend.latest.practicedCount} riktige på første forsøk`;
    dialog.querySelector('#history-best-value').textContent = percent(trend.bestAccuracy);
    dialog.querySelector('#history-streak-value').textContent = String(trend.bestStreak);
    dialog.querySelector('#history-comparison').textContent = comparison;
    dialog.querySelector('#history-records').textContent = records;
    if (announce) status.textContent = `Sammenligning oppdatert. ${announcement}`;

    const count = trend.recent.length;
    const context =
      count === 1
        ? 'Siste 1 sammenlignbar øving · eldst → nyest'
        : `Siste ${count} sammenlignbare øvinger · eldst → nyest`;
    dialog.querySelector('#history-chart-context').textContent = context;
    dialog.querySelector('#history-chart-latest').textContent =
      `Siste øving: ${percent(latestAccuracy)}`;
    dialog.querySelector('#history-chart-description').textContent =
      count === 1
        ? 'Avstand viser øvingsrekkefølge, ikke tid. Skalaen går fra 0 til 100 %. Fullfør en øving til i denne varianten for å se en trend.'
        : 'Avstand viser øvingsrekkefølge, ikke tid. Skalaen går fra 0 til 100 %.';

    const svg = dialog.querySelector('#history-chart');
    svg.replaceChildren();
    function shape(tag, attributes, text) {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
      if (text !== undefined) node.textContent = text;
      svg.append(node);
      return node;
    }

    const chart = { left: 42, right: 304, top: 20, bottom: 154 };
    for (const value of [0, 50, 100]) {
      const y = chart.bottom - (value / 100) * (chart.bottom - chart.top);
      shape('line', {
        x1: chart.left,
        x2: chart.right,
        y1: y,
        y2: y,
        class: 'chart-grid',
      });
      shape('text', { x: 2, y: y + 4, class: 'chart-axis-label' }, `${value} %`);
    }
    const points = trend.recent.map((result, index) => ({
      x:
        trend.recent.length === 1
          ? (chart.left + chart.right) / 2
          : chart.left + (index / (trend.recent.length - 1)) * (chart.right - chart.left),
      y: chart.bottom - (accuracy(result) / 100) * (chart.bottom - chart.top),
      result,
    }));
    if (points.length > 1) {
      const first = points[0];
      const last = points.at(-1);
      shape('path', {
        d: `M ${first.x} ${chart.bottom} L ${points.map(({ x, y }) => `${x} ${y}`).join(' L ')} L ${last.x} ${chart.bottom} Z`,
        class: 'chart-area',
      });
      shape('polyline', {
        points: points.map(({ x, y }) => `${x},${y}`).join(' '),
        class: 'chart-line',
        fill: 'none',
      });
    }
    points.forEach(({ x, y }, index) => {
      shape('circle', {
        cx: x,
        cy: y,
        r: index === points.length - 1 ? 5 : 4,
        class: index === points.length - 1 ? 'chart-point chart-point-latest' : 'chart-point',
      });
      shape(
        'text',
        { x, y: 180, 'text-anchor': 'middle', class: 'chart-attempt-label' },
        String(index + 1),
      );
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
    dialog.querySelector('#history-runs').hidden = history.length === 0;
    const byVariant = new Map();
    for (const result of history) {
      if (!byVariant.has(result.comparisonKey)) byVariant.set(result.comparisonKey, result);
    }
    const variants = variantLabels([...byVariant.values()]);
    if (!variants.some(({ result }) => result.comparisonKey === selectedKey)) {
      selectedKey = history[0]?.comparisonKey ?? null;
    }
    selector.replaceChildren();
    variants.forEach(({ result, label }) => {
      const option = element('option', label);
      option.value = result.comparisonKey;
      option.selected = result.comparisonKey === selectedKey;
      selector.append(option);
    });
    dialog.querySelector('#history-variant-controls').hidden = history.length === 0;
    const selected = history.find(({ comparisonKey }) => comparisonKey === selectedKey);
    dialog.querySelector('#history-variant-metadata').textContent = selected
      ? `${orders[selected.orderMode]} · Store og små bokstaver ${selected.caseSensitive ? 'skilles' : 'skilles ikke'} · Aksenter ${selected.accentSensitive ? 'skilles' : 'skilles ikke'}`
      : '';
    renderTrend(history);

    const focusedItem = document.activeElement.closest?.('#history-list > li');
    const focusedKey = focusedItem?.dataset.historyKey;
    const focusedPosition = focusedItem ? [...list.children].indexOf(focusedItem) : -1;
    const focusedIndex = history.findIndex((result) => `${profile.id}:${result.id}` === focusedKey);
    if (focusedIndex >= visibleCount) visibleCount = focusedIndex + 1;
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
        element('p', `${result.firstTryCount}/${result.practicedCount} riktig på første forsøk`),
      );
      item.lastElementChild.className = 'history-run-accuracy';
      item.append(
        element(
          'p',
          `${percent(accuracy(result))} · ${result.points} poeng · ${result.totalErrors} feilsvar · beste rekke ${result.bestStreak}`,
        ),
      );
      const details = element('details');
      details.append(
        element('summary', 'Vis øvingsdetaljer'),
        element(
          'p',
          `${result.practicedCount} øveoppføringer · ${result.totalErrors} feilsvar · ${result.extraPracticeCount} trengte mer øving.`,
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
      } else if (!focused) {
        const fallbackIndex = Math.min(focusedPosition, visibleItems.length - 1);
        (
          visibleItems[fallbackIndex]?.item.querySelector('summary') ?? dialog.querySelector('h2')
        ).focus();
      }
    }
    more.hidden = history.length <= visibleCount;
  }

  selector.addEventListener('change', () => {
    selectedKey = selector.value;
    renderTrend(getHistory(), true);
    const selected = newestFirst(getHistory()).find(
      ({ comparisonKey }) => comparisonKey === selectedKey,
    );
    dialog.querySelector('#history-variant-metadata').textContent = selected
      ? `${orders[selected.orderMode]} · Store og små bokstaver ${selected.caseSensitive ? 'skilles' : 'skilles ikke'} · Aksenter ${selected.accentSensitive ? 'skilles' : 'skilles ikke'}`
      : '';
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
      dialog.querySelector('#history-help').open = false;
      dialog.querySelector('#history-table-details').open = false;
      render();
      dialog.showModal();
      dialog.querySelector('h2').focus();
    },
  };
}
