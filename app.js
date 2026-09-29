/**
 * ЭЛЕКТРОСПРАВКА — Интерактивный поиск и фильтрация базы знаний
 */

// Базовый встроенный набор данных (гарантирует работу даже при открытии через file:// без веб-сервера)
let questionsData = [];

// Элементы интерфейса
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const questionsContainer = document.getElementById('questions-container');
const resultsCountText = document.getElementById('results-count-text');
const activeFilterBadge = document.getElementById('active-filter-badge');
const noResults = document.getElementById('no-results');
const resetSearchBtn = document.getElementById('reset-search-btn');
const expandAllBtn = document.getElementById('expand-all-btn');
const collapseAllBtn = document.getElementById('collapse-all-btn');

// Меню-бутерброд и Drawer
const burgerBtn = document.getElementById('burger-btn');
const sideDrawer = document.getElementById('side-drawer');
const drawerCloseBtn = document.getElementById('drawer-close-btn');
const overlay = document.getElementById('overlay');
const navItems = document.querySelectorAll('.nav-item');
const filterChips = document.querySelectorAll('.filter-chip');
const hintTags = document.querySelectorAll('.hint-tag');

// Тема
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const toast = document.getElementById('toast');

// Текущее состояние
let currentGroup = 'all'; // 'all', '1', '2', '3', '4', '5'
let searchQuery = '';

// 1. Инициализация приложения
async function initApp() {
  initTheme();
  setupZoomPrevention();
  setupEventListeners();
  await loadQuestionsData();
  updateCounts();
  applyFiltersAndRender();
}

// Запрет нежелательного зума на мобильных устройствах при листании
function setupZoomPrevention() {
  // Блокировка жестов pinch-to-zoom в Safari / WebKit на iOS
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });

  // Предотвращение случайного двойного тапа, вызывающего приближение страницы
  let lastTouchTime = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchTime <= 300) {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && !e.target.isContentEditable) {
        e.preventDefault();
      }
    }
    lastTouchTime = now;
  }, { passive: false });
}

// Загрузка данных (приоритет window.QUESTIONS_DATA для прямой работы через file:// и на сервере)
async function loadQuestionsData() {
  if (window.QUESTIONS_DATA && Array.isArray(window.QUESTIONS_DATA) && window.QUESTIONS_DATA.length > 0) {
    questionsData = window.QUESTIONS_DATA;
    console.log(`Загружено вопросов из базы данных: ${questionsData.length}`);
    return;
  }
  try {
    const response = await fetch('data/questions.json');
    if (response.ok) {
      questionsData = await response.json();
      console.log(`Загружено вопросов через fetch: ${questionsData.length}`);
    } else {
      throw new Error('Fetch failed');
    }
  } catch (e) {
    console.warn('Не удалось загрузить questions.json через fetch (локальный file://):', e);
    questionsData = getFallbackQuestions();
  }
}

// 2. Логика тем (Dark / Light)
function initTheme() {
  const savedTheme = localStorage.getItem('theme-mode');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme-mode', 'light');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme-mode', 'dark');
  }
}

// 3. Открытие / Закрытие бокового меню
function openDrawer() {
  sideDrawer.classList.add('open');
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  sideDrawer.classList.remove('open');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}

// 4. Установка активной группы
function setActiveGroup(group) {
  currentGroup = String(group);
  
  // Обновляем чипы
  filterChips.forEach(chip => {
    chip.classList.toggle('active', chip.dataset.group === currentGroup);
  });

  // Обновляем пункты в меню
  navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.group === currentGroup);
  });

  // Обновляем бейдж статуса
  const groupTitles = {
    'all': 'Все группы',
    '1': 'I группа',
    '2': 'II группа',
    '3': 'III группа',
    '4': 'IV группа',
    '5': 'V группа'
  };
  activeFilterBadge.textContent = groupTitles[currentGroup] || 'Все группы';

  visibleLimit = 30;
  applyFiltersAndRender();
}

// Римское обозначение групп электробезопасности
const ROMAN_GROUPS = {
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
  5: 'V',
  '1': 'I',
  '2': 'II',
  '3': 'III',
  '4': 'IV',
  '5': 'V'
};

function formatGroupRoman(group) {
  return ROMAN_GROUPS[group] || group;
}

// 5. Подсчет количества вопросов в категориях
function updateCounts() {
  const counts = { all: questionsData.length, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  questionsData.forEach(item => {
    if (counts[item.group] !== undefined) {
      counts[item.group]++;
    }
  });

  document.getElementById('count-all').textContent = counts.all;
  document.getElementById('count-g1').textContent = counts[1];
  document.getElementById('count-g2').textContent = counts[2];
  document.getElementById('count-g3').textContent = counts[3];
  document.getElementById('count-g4').textContent = counts[4];
  document.getElementById('count-g5').textContent = counts[5];
}

// Переменная пагинации
let visibleLimit = 30;

// 6. Фильтрация и рендеринг карточек
function applyFiltersAndRender() {
  const query = searchQuery.trim().toLowerCase();
  const words = query ? query.split(/\s+/).filter(w => w.length > 0) : [];
  
  // Автоматическое скрытие Hero-блока и фильтров при вводе текста в поиск
  const heroSection = document.getElementById('hero-section') || document.querySelector('.search-section');
  if (heroSection) {
    if (query.length > 0) {
      heroSection.classList.add('collapsed');
    } else {
      heroSection.classList.remove('collapsed');
    }
  }

  // 1. Фильтрация по всей базе данных с категоризацией совпадений
  const filtered = [];

  for (let i = 0; i < questionsData.length; i++) {
    const item = questionsData[i];

    // Проверка по группе
    const matchesGroup = (currentGroup === 'all' || String(item.group) === currentGroup);
    if (!matchesGroup) continue;

    // Без поискового запроса — сохраняем исходный порядок
    if (!query) {
      filtered.push({ item, tier: 0, matchPos: 0, index: i, matchType: null });
      continue;
    }

    const qLower = item.question.toLowerCase();
    const aLower = item.answer.toLowerCase();
    const docLower = (item.doc || '').toLowerCase();
    const inKeywords = item.keywords && item.keywords.some(k => k.toLowerCase().includes(query));

    // Проверка совпадений
    const fullInQ = qLower.includes(query);
    const allWordsInQ = words.length > 1 && words.every(w => qLower.includes(w));
    const fullInA = aLower.includes(query);
    const allWordsInA = words.length > 1 && words.every(w => aLower.includes(w));
    const inDoc = docLower.includes(query);
    const inMixed = words.length > 1 && words.every(w => qLower.includes(w) || aLower.includes(w));

    // Определение приоритета:
    // Tier 1-2: Совпадение в тексте вопроса (наивысший приоритет — показываются первыми)
    // Tier 3-4: Совпадение только в тексте ответа (вторичный приоритет — показываются после вопросов)
    // Tier 5-6: Совпадение в нормативном документе / ключевых словах / смешанное
    let tier = 99;
    let matchType = null;
    let matchPos = 9999;

    if (fullInQ) {
      tier = 1;
      matchPos = qLower.indexOf(query);
      matchType = (fullInA || allWordsInA) ? 'both' : 'question';
    } else if (allWordsInQ) {
      tier = 2;
      matchPos = qLower.indexOf(words[0]);
      matchType = (fullInA || allWordsInA) ? 'both' : 'question';
    } else if (fullInA) {
      tier = 3;
      matchPos = aLower.indexOf(query);
      matchType = 'answer';
    } else if (allWordsInA) {
      tier = 4;
      matchPos = aLower.indexOf(words[0]);
      matchType = 'answer';
    } else if (inDoc || inKeywords) {
      tier = 5;
      matchPos = inDoc ? docLower.indexOf(query) : 0;
      matchType = 'doc';
    } else if (inMixed) {
      tier = 6;
      matchPos = 0;
      matchType = 'mixed';
    }

    if (tier < 99) {
      filtered.push({ item, tier, matchPos, index: i, matchType });
    }
  }

  // 2. Сортировка результатов: совпадения в текстах вопросов всегда идут первыми
  if (query) {
    filtered.sort((a, b) => {
      // Сначала по приоритету (Tier 1-2 вопросы, затем Tier 3-4 ответы, затем прочие)
      if (a.tier !== b.tier) {
        return a.tier - b.tier;
      }
      // Внутри одного приоритета — более раннее вхождение поискового слова
      if (a.matchPos !== b.matchPos) {
        return a.matchPos - b.matchPos;
      }
      // При равенстве — стабильный исходный порядок
      return a.index - b.index;
    });
  }

  // Обновление счетчика с подробной разбивкой
  if (query && filtered.length > 0) {
    const qCount = filtered.filter(f => f.tier === 1 || f.tier === 2).length;
    const aCount = filtered.filter(f => f.tier === 3 || f.tier === 4).length;
    if (qCount > 0 && aCount > 0) {
      resultsCountText.textContent = `Найдено: ${filtered.length} (в вопросах: ${qCount}, в ответах: ${aCount})`;
    } else if (qCount > 0) {
      resultsCountText.textContent = `Найдено вопросов: ${filtered.length} (все в вопросах)`;
    } else {
      resultsCountText.textContent = `Найдено вопросов: ${filtered.length} (в ответах)`;
    }
  } else {
    resultsCountText.textContent = `Найдено вопросов: ${filtered.length}`;
  }

  // Рендер
  if (filtered.length === 0) {
    questionsContainer.innerHTML = '';
    noResults.classList.remove('hidden');
    removePaginationControls();
  } else {
    noResults.classList.add('hidden');
    
    // При поиске отображаем все совпадения, при общем просмотре — порциями
    const itemsToRender = query.length > 0 ? filtered : filtered.slice(0, visibleLimit);
    renderQuestions(itemsToRender, query);
    
    // Элементы управления пагинацией
    if (query.length === 0 && filtered.length > itemsToRender.length) {
      renderPaginationControls(itemsToRender.length, filtered.length);
    } else {
      removePaginationControls();
    }
  }
}

// 7. Формирование HTML списка вопросов
function renderQuestions(items, query) {
  questionsContainer.innerHTML = items.map((entry, index) => {
    const item = entry.item || entry;
    const matchType = entry.matchType || null;
    const isExpanded = query.length > 0; // При поиске автоматически раскрываем
    const highlightedQuestion = highlightText(item.question, query);
    const highlightedAnswer = highlightText(item.answer, query);
    const highlightedDoc = highlightText(item.doc, query);

    let matchBadgeHtml = '';
    if (query.length > 0 && matchType) {
      if (matchType === 'question' || matchType === 'both') {
        matchBadgeHtml = `
          <span class="match-location-badge in-question" title="Совпадение найдено в тексте вопроса">
            <span class="material-symbols-outlined">help</span>
            <span>В вопросе${matchType === 'both' ? ' и ответе' : ''}</span>
          </span>
        `;
      } else if (matchType === 'answer') {
        matchBadgeHtml = `
          <span class="match-location-badge in-answer" title="Совпадение найдено в тексте ответа">
            <span class="material-symbols-outlined">check_circle</span>
            <span>В ответе</span>
          </span>
        `;
      } else if (matchType === 'doc' || matchType === 'mixed') {
        matchBadgeHtml = `
          <span class="match-location-badge in-doc" title="Совпадение найдено в источнике">
            <span class="material-symbols-outlined">menu_book</span>
            <span>В документе</span>
          </span>
        `;
      }
    }

    return `
      <article class="question-card ${isExpanded ? 'expanded' : ''}" data-id="${item.id}">
        <button class="question-header" aria-expanded="${isExpanded}">
          <div class="question-title-wrap">
            <div class="card-top-meta">
              <span class="group-tag group-${item.group}">${formatGroupRoman(item.group)} ГРУППА</span>
              ${matchBadgeHtml}
            </div>
            <h2 class="question-text">${highlightedQuestion}</h2>
          </div>
          <span class="card-toggle-icon">
            <span class="material-symbols-outlined" style="font-size: 20px;">expand_more</span>
          </span>
        </button>
        <div class="question-body">
          <span class="answer-label">ОТВЕТ:</span>
          <div class="answer-text">${highlightedAnswer}</div>
          <div class="doc-source">
            <span class="material-symbols-outlined" style="font-size: 20px; flex-shrink: 0;">menu_book</span>
            <div><strong>Нормативный документ:</strong> ${highlightedDoc}</div>
          </div>
          <div class="card-footer">
            <button class="btn-copy" onclick="copyCardContent('${item.id}')">
              <span class="material-symbols-outlined" style="font-size: 18px;">content_copy</span>
              <span>Копировать ответ</span>
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Навешиваем клики по заголовкам карточек для аккордеона
  document.querySelectorAll('.question-header').forEach(header => {
    header.addEventListener('click', () => {
      const card = header.closest('.question-card');
      const isExpanded = card.classList.toggle('expanded');
      header.setAttribute('aria-expanded', isExpanded);
    });
  });
}

// Пагинация и кнопка "Загрузить еще"
function renderPaginationControls(shown, total) {
  let paginationBox = document.getElementById('pagination-box');
  if (!paginationBox) {
    paginationBox = document.createElement('div');
    paginationBox.id = 'pagination-box';
    paginationBox.className = 'pagination-box';
    questionsContainer.parentNode.insertBefore(paginationBox, questionsContainer.nextSibling);
  }
  
  const remaining = total - shown;
  const nextChunk = Math.min(30, remaining);

  paginationBox.innerHTML = `
    <div class="pagination-info">Показано <strong>${shown}</strong> из <strong>${total}</strong> вопросов</div>
    <div class="pagination-buttons">
      <button id="load-more-btn" class="btn-primary">Показать еще +${nextChunk}</button>
      <button id="load-all-btn" class="action-link-btn">Показать сразу все (${total})</button>
    </div>
  `;

  document.getElementById('load-more-btn').addEventListener('click', () => {
    visibleLimit += 30;
    applyFiltersAndRender();
  });

  document.getElementById('load-all-btn').addEventListener('click', () => {
    visibleLimit = total;
    applyFiltersAndRender();
  });
}

function removePaginationControls() {
  const paginationBox = document.getElementById('pagination-box');
  if (paginationBox) {
    paginationBox.remove();
  }
}

// 8. Подсветка искомого текста
function highlightText(text, query) {
  if (!query || !text) return escapeHtml(text);
  
  const words = query.split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) return escapeHtml(text);

  const pattern = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi');
  const escaped = escapeHtml(text);
  
  return escaped.replace(pattern, '<mark>$1</mark>');
}

function escapeHtml(string) {
  return String(string)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 9. Копирование ответа
window.copyCardContent = function(id) {
  const item = questionsData.find(q => q.id === id);
  if (!item) return;

  const textToCopy = `Вопрос: ${item.question}\n\nОтвет: ${item.answer}\n\nИсточник: ${item.doc}`;
  navigator.clipboard.writeText(textToCopy).then(() => {
    showToast('Вопрос и ответ скопированы в буфер');
  }).catch(() => {
    showToast('Не удалось скопировать текст');
  });
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// 10. Настройка слушателей событий
function setupEventListeners() {
  // Поиск
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    clearSearchBtn.classList.toggle('visible', searchQuery.length > 0);
    applyFiltersAndRender();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.classList.remove('visible');
    searchInput.focus();
    applyFiltersAndRender();
  });

  // Теги-подсказки
  hintTags.forEach(tag => {
    tag.addEventListener('click', () => {
      const keyword = tag.dataset.tag;
      searchInput.value = keyword;
      searchQuery = keyword;
      clearSearchBtn.classList.add('visible');
      applyFiltersAndRender();
    });
  });

  // Быстрые фильтры (чипы)
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      setActiveGroup(chip.dataset.group);
    });
  });

  // Меню-бутерброд
  burgerBtn.addEventListener('click', openDrawer);
  drawerCloseBtn.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);

  // Пункты меню Drawer
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      setActiveGroup(item.dataset.group);
      closeDrawer();
    });
  });

  document.getElementById('btn-show-rules')?.addEventListener('click', closeDrawer);

  // Модальное окно истории изменений (Changelog)
  const changelogBtn = document.getElementById('btn-show-changelog');
  const changelogModal = document.getElementById('changelog-modal');
  const changelogCloseBtn = document.getElementById('changelog-close-btn');

  if (changelogBtn && changelogModal) {
    changelogBtn.addEventListener('click', () => {
      closeDrawer();
      changelogModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    });

    const closeChangelog = () => {
      changelogModal.classList.remove('open');
      document.body.style.overflow = '';
    };

    if (changelogCloseBtn) {
      changelogCloseBtn.addEventListener('click', closeChangelog);
    }

    changelogModal.addEventListener('click', (e) => {
      if (e.target === changelogModal) {
        closeChangelog();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && changelogModal.classList.contains('open')) {
        closeChangelog();
      }
    });
  }

  // Тема
  themeToggleBtn.addEventListener('click', toggleTheme);

  // Сброс фильтров
  resetSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.classList.remove('visible');
    setActiveGroup('all');
  });

  // Развернуть / Свернуть все
  expandAllBtn.addEventListener('click', () => {
    document.querySelectorAll('.question-card').forEach(card => card.classList.add('expanded'));
  });

  collapseAllBtn.addEventListener('click', () => {
    document.querySelectorAll('.question-card').forEach(card => card.classList.remove('expanded'));
  });

  // Горячая клавиша '/' для поиска
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput && !document.getElementById('changelog-modal')?.classList.contains('open') && !document.getElementById('pwa-modal')?.classList.contains('open')) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  // Инициализация PWA и Service Worker
  setupPWA();
}

// 12. Логика PWA и офлайн-режима
let deferredPrompt = null;

function setupPWA() {
  // Регистрация Service Worker (с поддержкой iOS Safari и проверкой защищенного контекста)
  const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if ('serviceWorker' in navigator && isSecure) {
    const registerSW = () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' })
        .then((reg) => {
          console.log('[PWA] Service Worker успешно зарегистрирован:', reg.scope);

          // Проверяем наличие ожидающего обновления Service Worker
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }

          reg.addEventListener('updatefound', () => {
            const installing = reg.installing;
            if (installing) {
              installing.addEventListener('statechange', () => {
                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[PWA] Доступно обновление кэша, активируем...');
                  installing.postMessage({ type: 'SKIP_WAITING' });
                }
              });
            }
          });
        })
        .catch((err) => {
          console.warn('[PWA] Ошибка регистрации Service Worker:', err);
        });
    };

    // Регистрируем немедленно, если документ уже загрузился (критично для iOS)
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      registerSW();
    } else {
      window.addEventListener('load', registerSW);
    }

    // Слушатель смены контроллера: оповещение пользователя о готовности офлайн-кэша
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[PWA] Контроллер обновлен. Приложение готово к автономной работе.');
      showToast('✓ База знаний сохранена в кэш устройства для работы без интернета');
    });
  } else if (!isSecure && 'serviceWorker' in navigator) {
    console.warn('[PWA] Внимание: iOS Safari блокирует Service Worker на незащищенном HTTP (кроме localhost). Для офлайн-режима используйте защищенный HTTPS-туннель.');
  }

  // Модальное окно установки PWA
  const pwaModal = document.getElementById('pwa-modal');
  const pwaModalCloseBtn = document.getElementById('pwa-modal-close-btn');
  const btnShowPwaModal = document.getElementById('btn-show-pwa-modal');
  const pwaInstallHeaderBtn = document.getElementById('pwa-install-header-btn');
  const pwaActionBox = document.getElementById('pwa-install-action-box');
  const btnTriggerPwaInstall = document.getElementById('btn-trigger-pwa-install');

  const openPwaModal = () => {
    closeDrawer();
    if (pwaModal) {
      pwaModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  };

  const closePwaModal = () => {
    if (pwaModal) {
      pwaModal.classList.remove('open');
      document.body.style.overflow = '';
    }
  };

  if (btnShowPwaModal) btnShowPwaModal.addEventListener('click', openPwaModal);
  if (pwaInstallHeaderBtn) pwaInstallHeaderBtn.addEventListener('click', openPwaModal);
  if (pwaModalCloseBtn) pwaModalCloseBtn.addEventListener('click', closePwaModal);

  if (pwaModal) {
    pwaModal.addEventListener('click', (e) => {
      if (e.target === pwaModal) closePwaModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pwaModal?.classList.contains('open')) {
      closePwaModal();
    }
  });

  // Перехват события beforeinstallprompt для браузеров Android/Chrome/Edge
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (pwaActionBox) pwaActionBox.classList.remove('hidden');
    if (pwaInstallHeaderBtn) pwaInstallHeaderBtn.classList.remove('hidden');
  });

  if (btnTriggerPwaInstall) {
    btnTriggerPwaInstall.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log('[PWA] Результат установки:', outcome);
        deferredPrompt = null;
        if (pwaActionBox) pwaActionBox.classList.add('hidden');
        closePwaModal();
      } else {
        showToast('Используйте меню браузера для установки');
      }
    });
  }

  // Оповещения о статусе сети
  window.addEventListener('offline', () => {
    showToast('Режим офлайн: справочник работает автономно из кэша');
  });

  window.addEventListener('online', () => {
    showToast('Соединение с интернетом восстановлено');
  });
}

// 11. Резервная база вопросов (fallback для надежности)
function getFallbackQuestions() {
  return [
    {
      "id": "g1-01",
      "group": 1,
      "groupTitle": "I группа по электробезопасности",
      "question": "Кому и как присваивается I группа по электробезопасности?",
      "answer": "Присваивается неэлектротехническому персоналу, выполняющему работы, при которых может возникнуть опасность поражения током (работа с ПЭВМ, оргтехникой, переносным электроинструментом). Проводится путем инструктажа с устным опросом и проверкой навыков первой помощи.",
      "doc": "ПОТЭЭ, п. 2.3",
      "keywords": ["персонал", "инструктаж", "офис", "компьютер", "проверка знаний", "неэлектротехнический"]
    },
    {
      "id": "g1-04",
      "group": 1,
      "groupTitle": "I группа по электробезопасности",
      "question": "Каков порядок действий при освобождении пострадавшего от действия электрического тока до 1000 В?",
      "answer": "1. Обесточить электроустановку (рубильник, выключатель, выдернуть вилку).\n2. При невозможности быстрого отключения — отделить пострадавшего сухими токонепроводящими предметами (палка, доска, канат).\n3. Действовать одной рукой, надеть диэлектрические перчатки при их наличии.",
      "doc": "Инструкция по первой помощи при несчастных случаях",
      "keywords": ["освобождение", "первая помощь", "до 1000 В", "отключение"]
    },
    {
      "id": "g2-02",
      "group": 2,
      "groupTitle": "II группа по электробезопасности",
      "question": "Что относится к основным и дополнительным изолирующим электрозащитным средствам до 1000 В?",
      "answer": "Основные (выдерживают рабочее напряжение): штанги, изолирующие клещи, указатели напряжения, диэлектрические перчатки, ручной изолирующий инструмент.\nДополнительные (применяются только совместно с основными): диэлектрические галоши, коврики, подставки, накладки, стеклопластиковые лестницы.",
      "doc": "СО 153-34.03.603-2003",
      "keywords": ["защитные средства", "до 1000 В", "основные", "дополнительные", "диэлектрические перчатки"]
    },
    {
      "id": "g3-01",
      "group": 3,
      "groupTitle": "III группа по электробезопасности",
      "question": "Какие организационные мероприятия обеспечивают безопасность работ в электроустановках?",
      "answer": "1. Оформление работ нарядом-допуском, распоряжением или перечнем работ в порядке текущей эксплуатации;\n2. Выдача разрешения на подготовку рабочего места и на допуск к работе;\n3. Допуск к работе;\n4. Надзор во время работы;\n5. Оформление перерывов, перевода на другое место и окончания работ.",
      "doc": "ПОТЭЭ, п. 5.1",
      "keywords": ["организационные мероприятия", "наряд-допуск", "распоряжение", "допуск", "надзор"]
    },
    {
      "id": "g3-02",
      "group": 3,
      "groupTitle": "III группа по электробезопасности",
      "question": "Каков порядок выполнения технических мероприятий со снятием напряжения?",
      "answer": "1. Произвести необходимые отключения;\n2. Вывесить запрещающие плакаты;\n3. Проверить отсутствие напряжения;\n4. Установить заземление (включить ножи или наложить переносные заземления);\n5. Вывесить указательные плакаты «ЗАЗЕМЛЕНО» и оградить рабочее место.",
      "doc": "ПОТЭЭ, п. 16.1",
      "keywords": ["технические мероприятия", "снятие напряжения", "заземление", "плакаты"]
    },
    {
      "id": "g4-01",
      "group": 4,
      "groupTitle": "IV группа по электробезопасности",
      "question": "Кто может быть назначен ответственным за электрохозяйство и его заместителем?",
      "answer": "Назначаются приказом руководителя из числа административно-технического персонала после проверки знаний в Ростехнадзоре. В установках до 1000 В — группа IV, в установках выше 1000 В — группа V.",
      "doc": "ПТЭЭП (Приказ № 811)",
      "keywords": ["ответственный за электрохозяйство", "руководитель", "IV группа", "V группа", "Ростехнадзор"]
    },
    {
      "id": "g5-01",
      "group": 5,
      "groupTitle": "V группа по электробезопасности",
      "question": "Каковы квалификационные требования к работнику для присвоения V группы по электробезопасности?",
      "answer": "Знание схем, компоновки оборудования предприятия, знание ПОТЭЭ, ПУЭ, ПТЭЭП. Умение организовать безопасное производство и руководить работами в электроустановках любого напряжения, проводить инструктажи и обучать персонал.",
      "doc": "ПОТЭЭ, Приложение № 1",
      "keywords": ["требования V группа", "выше 1000 В", "руководство работами", "любое напряжение"]
    }
  ];
}

// Запуск
document.addEventListener('DOMContentLoaded', initApp);
