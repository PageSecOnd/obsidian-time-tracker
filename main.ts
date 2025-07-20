import {
    Plugin,
    ItemView,
    WorkspaceLeaf,
    normalizePath,
    PluginSettingTab,
    App,
    Setting,
    TFile,
} from "obsidian";

declare global {
  interface Window {
    confetti?: (...args: unknown[]) => void;
  }
}

// ========== 多语言文本 ==========
type LangKey = 'zh' | 'en';
type LangDict = { [key: string]: string };
const LANG_TEXT: Record<LangKey, LangDict> = {
    zh: {
        timeTracker: "时间追踪",
        total: "累计用时",
        session: "本次用时：",
        levelProgress: "等级进度",
        levelTime: "本级用时",
        levelNeed: "升级还需",
        by: "by PageSecOnd",
        hour: "小时",
        min: "分",
        sec: "秒",
        saveInterval: "自动保存间隔（秒）",
        saveIntervalDesc: "每隔多少秒自动保存累计时间（最小1秒）",
        levelUpHours: "升级所需小时数",
        levelUpHoursDesc: "每累计多少小时升级（建议10~100小时）",
        showSeconds: "显示秒数",
        showSecondsDesc: "累计用时和本次用时是否显示秒数",
        progressBarColor: "进度条主色",
        progressBarColorDesc: "可自定义进度条主色",
        enableAudio: "升级时播放音效",
        enableAudioDesc: "每次升级自动播放奖励音效",
        enableConfetti: "升级时烟花特效",
        enableConfettiDesc: "每次升级自动播放烟花动画",
        prefixText: "累计用时前缀",
        prefixTextDesc: "如“累计”、“已用时”，可自定义",
        showFooter: "显示页脚作者",
        showFooterDesc: "是否显示 by PageSecOnd",
        language: "界面语言 / Language",
        languageDesc: "切换插件界面语言 / Switch plugin language",
        chinese: "简体中文",
        english: "English",
        heatmapTitle: "热力图",
        minUnit: "分钟",
        settingsHeader: "Time Tracker 设置",
    },
    en: {
        timeTracker: "Time Tracker",
        total: "Total Time",
        session: "Session:",
        levelProgress: "Level Progress",
        levelTime: "Time This Level",
        levelNeed: "Time to Next Level",
        by: "by PageSecOnd",
        hour: "h",
        min: "min",
        sec: "s",
        saveInterval: "Auto Save Interval (seconds)",
        saveIntervalDesc: "How many seconds to auto-save (minimum 1s)",
        levelUpHours: "Hours per Level",
        levelUpHoursDesc: "How many hours per level (recommend 10~100)",
        showSeconds: "Show Seconds",
        showSecondsDesc: "Show seconds in total/session time",
        progressBarColor: "Progress Bar Main Color",
        progressBarColorDesc: "Customize progress bar color",
        enableAudio: "Play Audio on Level Up",
        enableAudioDesc: "Play reward sound on level up",
        enableConfetti: "Show Confetti on Level Up",
        enableConfettiDesc: "Show confetti animation on level up",
        prefixText: "Total",
        prefixTextDesc: 'Like "Total", "Used", customizable',
        showFooter: "Show Footer Author",
        showFooterDesc: "Show by PageSecOnd",
        language: "界面语言 / Language",
        languageDesc: "切换插件界面语言 / Switch plugin language",
        chinese: "简体中文",
        english: "English",
        heatmapTitle: "Heatmap",
        minUnit: "min",
        settingsHeader: "Time Tracker Settings",
    }
};

function t(pluginOrLang: TimeTrackerPlugin | LangKey, key: string): string {
    let lang: LangKey;
    if (typeof pluginOrLang === "string") lang = pluginOrLang;
    else lang = (pluginOrLang.settings.language || "zh") as LangKey;
    return (LANG_TEXT[lang][key] ?? LANG_TEXT["zh"][key]) || key;
}

// ========== 常量与类型定义 ==========

const VIEW_TYPE = "time-tracker-view";
const STATS_FILE = ".timestats.json";
const TIMELINE_FOLDER = "Timeline";
const TIMELINE_FILE = "Timeline/TimeLevel.md";
const TIMELINE_HEADER = "```timeline\n[line-3, body-2]\n";

interface TimeTrackerSettings {
    saveIntervalSeconds: number;
    levelUpHours: number;
    showSeconds: boolean;
    progressBarColor: string;
    enableAudio: boolean;
    enableConfetti: boolean;
    prefixText: string;
    showFooter: boolean;
    language: LangKey;
}

type TimeStatsData = {
    totalTime: { hours: number; minutes: number; seconds: number };
    daily?: Record<string, number>;
};

const DEFAULT_SETTINGS: TimeTrackerSettings = {
    saveIntervalSeconds: 5,
    levelUpHours: 10,
    showSeconds: false,
    progressBarColor: "#457b9d",
    enableAudio: true,
    enableConfetti: true,
    prefixText: LANG_TEXT["zh"]["prefixText"],
    showFooter: true,
    language: "zh",
};

// ========== 工具函数 ==========

function msToHMS(ms: number) {
    if (typeof ms !== "number" || isNaN(ms) || ms < 0) ms = 0;
    const sec = Math.floor(ms / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return { hours: h, minutes: m, seconds: s };
}

function hmsToMs(hms: { hours: number; minutes: number; seconds: number }) {
    if (!hms || typeof hms !== "object") return 0;
    const h = typeof hms.hours === "number" && !isNaN(hms.hours) ? hms.hours : 0;
    const m = typeof hms.minutes === "number" && !isNaN(hms.minutes) ? hms.minutes : 0;
    const s = typeof hms.seconds === "number" && !isNaN(hms.seconds) ? hms.seconds : 0;
    return h * 3600_000 + m * 60_000 + s * 1000;
}

function formatDuration(ms: number, showSeconds: boolean, plugin?: TimeTrackerPlugin): string {
    if (typeof ms !== "number" || isNaN(ms) || ms < 0) ms = 0;
    const sec = Math.floor(ms / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    let out = "";
    if (plugin) {
        if (h > 0) out += `${h}${t(plugin, "hour")}`;
        if (m > 0 || h > 0) out += `${m}${t(plugin, "min")}`;
        if (showSeconds || (h === 0 && m === 0)) out += `${s}${t(plugin, "sec")}`;
    } else {
        if (h > 0) out += `${h}小时`;
        if (m > 0 || h > 0) out += `${m}分`;
        if (showSeconds || (h === 0 && m === 0)) out += `${s}秒`;
    }
    return out;
}

function formatTotalTime(ms: number, prefix: string, showSeconds: boolean, plugin: TimeTrackerPlugin): string {
    if (typeof ms !== "number" || isNaN(ms) || ms < 0) ms = 0;
    const totalMinutes = Math.floor(ms / 60000);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    const s = Math.floor((ms / 1000) % 60);
    const hourTxt = t(plugin, "hour");
    const minTxt = t(plugin, "min");
    const secTxt = t(plugin, "sec");
    if (h === 0) {
        if (showSeconds) {
            return `${prefix} ${m}${minTxt}${s}${secTxt}`;
        } else {
            return `${prefix} ${m}${minTxt}`;
        }
    }
    if (showSeconds) {
        return `${prefix} ${h}${hourTxt}${m}${minTxt}${s}${secTxt}`;
    }
    return `${prefix} ${h}${hourTxt}${m}${minTxt}`;
}

function renderHeatMap(dailyStats: Record<string, number>, plugin: TimeTrackerPlugin): HTMLElement {
    const days = 365;
    const today = new Date();
    const data: number[] = [];
    const labels: string[] = [];
    let maxVal = 0;
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const val = dailyStats[key] || 0;
        data.push(val);
        labels.push(key);
        if (val > maxVal) maxVal = val;
    }
    const weeks = Math.ceil(days / 7);
    const cellSize = 15, gap = 2;
    const w = weeks * (cellSize + gap);
    const h = 7 * (cellSize + gap);

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${w+30} ${h+30}`);
    svg.setAttribute("width", "100%");
    svg.style.display = "block";
    svg.style.background = "#fff";
    svg.style.maxWidth = "100%";

    for (let i = 0; i < data.length; i++) {
        const week = Math.floor(i / 7);
        const day = i % 7;
        const v = data[i];
        let color = "#ebedf0";
        if (v > 0) {
            const percent = Math.min(1, v / (maxVal || 1));
            if (percent > 0.8) color = "#216e39";
            else if (percent > 0.6) color = "#30a14e";
            else if (percent > 0.3) color = "#40c463";
            else color = "#9be9a8";
        }
        const rect = document.createElementNS(svgNS, "rect");
        rect.setAttribute("x", (week * (cellSize + gap)+22).toString());
        rect.setAttribute("y", (day * (cellSize + gap)+16).toString());
        rect.setAttribute("width", cellSize.toString());
        rect.setAttribute("height", cellSize.toString());
        rect.setAttribute("fill", color);
        rect.setAttribute("rx", "2");
        rect.setAttribute("data-date", labels[i]);
        rect.setAttribute("data-value", v.toString());
        rect.setAttribute("title", `${labels[i]}: ${Math.round(v/60)}${t(plugin, "minUnit")}`);
        svg.appendChild(rect);
    }
    const weekNames = plugin.settings.language === "zh"
        ? ["日", "一", "二", "三", "四", "五", "六"]
        : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (let i = 0; i < 7; i++) {
        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("x", "4");
        text.setAttribute("y", (i * (cellSize + gap) + 27).toString());
        text.setAttribute("font-size", "10");
        text.setAttribute("fill", "#888");
        text.textContent = weekNames[i];
        svg.appendChild(text);
    }
    const titleText = document.createElementNS(svgNS, "text");
    titleText.setAttribute("x", "2");
    titleText.setAttribute("y", "12");
    titleText.setAttribute("font-size", "13");
    titleText.setAttribute("fill", "#555");
    titleText.textContent = t(plugin, "heatmapTitle");
    svg.appendChild(titleText);

    const container = document.createElement("div");
    container.style.width = "100%";
    container.style.maxWidth = "100%";
    container.style.overflowX = "hidden";
    container.style.boxSizing = "border-box";
    container.style.padding = "8px 0";
    container.appendChild(svg);
    return container;
}

function animateBar(
    el: HTMLElement,
    from: number,
    to: number,
    duration = 500
) {
    const start = Date.now();
    function step() {
        const now = Date.now();
        const t = Math.min(1, (now - start) / duration);
        const val = from + (to - from) * t;
        el.style.width = `${Math.max(6, Math.floor(val * 100))}%`;
        if (t < 1) requestAnimationFrame(step);
        else el.style.width = `${Math.max(6, Math.floor(to * 100))}%`;
    }
    step();
}

function injectConfetti() {
    if (window.confetti) return;
    const script = document.createElement("script");
    script.src =
        "https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js";
    script.async = true;
    document.head.appendChild(script);
}

function playAudio() {
    try {
        const audio = new Audio(
            "https://cdn.jsdelivr.net/gh/zh-lx/piano-mp3/A4.mp3"
        );
        audio.volume = 0.25;
        audio.play();
    } catch (e) {
        // intentionally empty
    }
}

function getTimelineEvent(level: number, totalTime: number, sessionTime: number): string {
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    return [
        `+ ${timeStr} 升级至 Lv.${level}`,
        `+ 升级到 Lv.${level}`,
        `+ 已累计用时：${formatDuration(totalTime, true)}，本次会话：${formatDuration(sessionTime, true)}。干得漂亮，继续加油！`
    ].join('\n') + '\n\n';
}

async function ensureTimelineFile(app: App): Promise<TFile> {
    const folderPath = normalizePath(TIMELINE_FOLDER);
    try { await app.vault.adapter.mkdir(folderPath); } catch (e) { /* ignore */ }
    let file: TFile | null = app.vault.getAbstractFileByPath(normalizePath(TIMELINE_FILE)) as TFile;
    if (!file) {
        await app.vault.create(normalizePath(TIMELINE_FILE), `${TIMELINE_HEADER}\n\`\`\`\n`);
        file = app.vault.getAbstractFileByPath(normalizePath(TIMELINE_FILE)) as TFile;
    }
    if (!file) {
        throw new Error("Failed to create or retrieve the Timeline file.");
    }
    return file;
}

async function appendTimelineEvent(app: App, event: string) {
    const file = await ensureTimelineFile(app);
    let content = await app.vault.read(file);
    const codeBlockStart = content.indexOf(TIMELINE_HEADER);
    const codeBlockEnd = content.indexOf("```", codeBlockStart + TIMELINE_HEADER.length);
    if (codeBlockStart !== -1 && codeBlockEnd !== -1) {
        content = content.slice(0, codeBlockEnd) + event + content.slice(codeBlockEnd);
    } else {
        content = `${TIMELINE_HEADER}${event}\`\`\`\n`;
    }
    await app.vault.modify(file, content);
}

// ========== 主插件类 ==========

export default class TimeTrackerPlugin extends Plugin {
    private startTime = 0;
    private totalTime = 0;
    private intervalId: number | null = null;
    private saveIntervalId: number | null = null;
    private daily: Record<string, number> = {};
    settings: TimeTrackerSettings = { ...DEFAULT_SETTINGS };
    private settingTab: TimeTrackerSettingTab | null = null;

    async onload() {
        await this.loadSettings();
        this.startTime = Date.now();

        try {
            const fileContent = await this.app.vault.adapter.read(
                normalizePath(STATS_FILE)
            );
            if (fileContent.trim().length > 0) {
                const fileJson: TimeStatsData = JSON.parse(fileContent);
                if (
                    typeof fileJson.totalTime === "object" &&
                    fileJson.totalTime !== null
                ) {
                    const ms = hmsToMs(fileJson.totalTime);
                    if (!isNaN(ms)) this.totalTime = ms;
                }
                if (fileJson.daily) this.daily = fileJson.daily;
            }
        } catch (e) {
            this.totalTime = 0;
            this.daily = {};
        }

        this.registerView(VIEW_TYPE, (leaf: WorkspaceLeaf) => new TimeTrackerView(leaf, this));

        this.addRibbonIcon("clock", t(this, "timeTracker"), () => {
            this.activateView();
        });

        this.settingTab = new TimeTrackerSettingTab(this.app, this);
        this.addSettingTab(this.settingTab);

        this.app.workspace.onLayoutReady(() => {
            this.activateView();
        });

        this.intervalId = window.setInterval(() => {
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
            for (const leaf of leaves) {
                const view = leaf.view as TimeTrackerView;
                view.updateTimes();
            }
        }, 1000);

        this.startSaveInterval();

        this.registerMarkdownCodeBlockProcessor("showHeatMap", async (source, el, ctx) => {
            let dailyStats: Record<string, number> = {};
            try {
                const fileContent = await this.app.vault.adapter.read(normalizePath(STATS_FILE));
                const fileJson: TimeStatsData = JSON.parse(fileContent);
                if (fileJson.daily) dailyStats = fileJson.daily;
            } catch (e) { /* ignore */ }
            el.appendChild(renderHeatMap(dailyStats, this));
        });
    }

    async onunload() {
        await this.saveTotalTime(true);
        if (this.intervalId) window.clearInterval(this.intervalId);
        if (this.saveIntervalId) window.clearInterval(this.saveIntervalId);
    }

    startSaveInterval() {
        if (this.saveIntervalId) window.clearInterval(this.saveIntervalId);
        this.saveIntervalId = window.setInterval(() => {
            this.saveTotalTime(false);
        }, Math.max(1000, this.settings.saveIntervalSeconds * 1000));
    }

    async saveTotalTime(isFinal = false) {
        const session = Date.now() - this.startTime;
        const saveTime = this.totalTime + session;

        const dayKey = new Date().toISOString().slice(0, 10);
        if (!this.daily[dayKey]) this.daily[dayKey] = 0;
        this.daily[dayKey] += session;

        const hms = msToHMS(saveTime);
        try {
            await this.app.vault.adapter.write(
                normalizePath(STATS_FILE),
                JSON.stringify({ totalTime: hms, daily: this.daily }, null, 2)
            );
        } catch (e) { /* ignore */ }

        if (isFinal) {
            this.totalTime = saveTime;
            this.startTime = Date.now();
        }
    }

    async activateView() {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
        if (leaves.length === 0) {
            const leaf = this.app.workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({
                    type: VIEW_TYPE,
                    active: true,
                });
            }
        }
    }

    public getSessionTime(): number {
        return Date.now() - this.startTime;
    }
    public getTotalTime(): number {
        return this.totalTime + this.getSessionTime();
    }

    async loadSettings() {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings);
    }

    async saveSettings() {
        await this.saveData({ settings: this.settings });
    }

    public refreshAllViews() {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
        for (const leaf of leaves) {
            const view = leaf.view as TimeTrackerView;
            if (typeof view.updateTimes === "function") view.updateTimes();
            if (typeof view.injectStyles === "function") view.injectStyles();
        }
        if (this.settingTab) this.settingTab.forceRerender();
    }
}

// ========== 设置面板 ==========

class TimeTrackerSettingTab extends PluginSettingTab {
    plugin: TimeTrackerPlugin;
    private rerenderFlag = 0;

    constructor(app: App, plugin: TimeTrackerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    // 允许强制重渲染
    forceRerender() {
        this.rerenderFlag++;
        this.display();
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        // 保证头部随语言变化
        containerEl.createEl("h2", { text: t(this.plugin, "settingsHeader") });

        new Setting(containerEl)
            .setName(t(this.plugin, "saveInterval"))
            .setDesc(t(this.plugin, "saveIntervalDesc"))
            .addText((text) =>
                text
                    .setPlaceholder("5")
                    .setValue(String(this.plugin.settings.saveIntervalSeconds))
                    .onChange(async (value) => {
                        let v = parseInt(value);
                        if (isNaN(v) || v < 1) v = 1;
                        this.plugin.settings.saveIntervalSeconds = v;
                        await this.plugin.saveSettings();
                        this.plugin.startSaveInterval();
                        this.plugin.refreshAllViews();
                    })
            );

        new Setting(containerEl)
            .setName(t(this.plugin, "levelUpHours"))
            .setDesc(t(this.plugin, "levelUpHoursDesc"))
            .addText((text) =>
                text
                    .setPlaceholder("10")
                    .setValue(String(this.plugin.settings.levelUpHours))
                    .onChange(async (value) => {
                        let v = parseInt(value);
                        if (isNaN(v) || v < 1) v = 10;
                        this.plugin.settings.levelUpHours = v;
                        await this.plugin.saveSettings();
                        this.plugin.refreshAllViews();
                    })
            );

        new Setting(containerEl)
            .setName(t(this.plugin, "showSeconds"))
            .setDesc(t(this.plugin, "showSecondsDesc"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.showSeconds)
                    .onChange(async (value) => {
                        this.plugin.settings.showSeconds = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshAllViews();
                    })
            );

        new Setting(containerEl)
            .setName(t(this.plugin, "progressBarColor"))
            .setDesc(t(this.plugin, "progressBarColorDesc"))
            .addText((text) =>
                text
                    .setPlaceholder("#457b9d")
                    .setValue(this.plugin.settings.progressBarColor)
                    .onChange(async (value) => {
                        this.plugin.settings.progressBarColor = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshAllViews();
                    })
            );

        new Setting(containerEl)
            .setName(t(this.plugin, "enableAudio"))
            .setDesc(t(this.plugin, "enableAudioDesc"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableAudio)
                    .onChange(async (value) => {
                        this.plugin.settings.enableAudio = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshAllViews();
                    })
            );

        new Setting(containerEl)
            .setName(t(this.plugin, "enableConfetti"))
            .setDesc(t(this.plugin, "enableConfettiDesc"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableConfetti)
                    .onChange(async (value) => {
                        this.plugin.settings.enableConfetti = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshAllViews();
                    })
            );

        new Setting(containerEl)
            .setName(t(this.plugin, "prefixText"))
            .setDesc(t(this.plugin, "prefixTextDesc"))
            .addText((text) =>
                text
                    .setPlaceholder(t(this.plugin, "prefixText"))
                    .setValue(this.plugin.settings.prefixText)
                    .onChange(async (value) => {
                        this.plugin.settings.prefixText = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshAllViews();
                    })
            );

        new Setting(containerEl)
            .setName(t(this.plugin, "showFooter"))
            .setDesc(t(this.plugin, "showFooterDesc"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.showFooter)
                    .onChange(async (value) => {
                        this.plugin.settings.showFooter = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshAllViews();
                    })
            );

        // 语言选择，切换时设置面板立刻重渲染，且前缀仅在默认时才自动切换
        new Setting(containerEl)
            .setName(t(this.plugin, "language"))
            .setDesc(t(this.plugin, "languageDesc"))
            .addDropdown(drop => 
                drop.addOption("zh", t(this.plugin, "chinese"))
                    .addOption("en", t(this.plugin, "english"))
                    .setValue(this.plugin.settings.language)
                    .onChange(async (value) => {
                        const old = this.plugin.settings.prefixText;
                        const isOldChinese = old === LANG_TEXT["zh"]["prefixText"] || old === "累计";
                        const isOldEnglish = old === LANG_TEXT["en"]["prefixText"] || old === "Total";
                        this.plugin.settings.language = value as LangKey;
                        // 只在原前缀为默认值时才自动切换
                        if ((value === "zh" && isOldEnglish) || (value === "en" && isOldChinese)) {
                            this.plugin.settings.prefixText = LANG_TEXT[value as LangKey]["prefixText"] || "";
                        }
                        await this.plugin.saveSettings();
                        this.plugin.refreshAllViews();
                    })
            );
    }
}

// ========== 视图类 ==========

class TimeTrackerView extends ItemView {
    private plugin: TimeTrackerPlugin;
    private totalDiv!: HTMLDivElement;
    private sessionDiv!: HTMLDivElement;
    private totalBar!: HTMLDivElement;
    private levelDiv!: HTMLDivElement;
    private lastLevel = 1;
    private lastSeconds = 0;
    private levelInfoDiv!: HTMLDivElement;
    private footerDiv: HTMLDivElement | null = null;
    private totalLabelDiv!: HTMLDivElement; // 新增

    constructor(leaf: WorkspaceLeaf, plugin: TimeTrackerPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE; }
    getDisplayText(): string { return t(this.plugin, "timeTracker"); }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.classList.add("tt-root");

        const content = container.createDiv({ cls: "tt-content" });

        const levelWrap = content.createDiv({ cls: "tt-section tt-level-section" });
        this.levelDiv = levelWrap.createDiv({ cls: "tt-level" });

        const totalWrap = content.createDiv({ cls: "tt-section tt-total-section" });
        this.totalDiv = totalWrap.createDiv({ cls: "tt-total" });
        this.totalLabelDiv = totalWrap.createEl("div", { cls: "tt-label tt-total-label" }); // 保存引用
        this.totalLabelDiv.setText(t(this.plugin, "total")); // 初始赋值
        this.totalBar = totalWrap.createDiv({ cls: "tt-bar-outer" })
            .createDiv({ cls: "tt-bar-inner tt-bar-total" });

        this.levelInfoDiv = totalWrap.createDiv({ cls: "tt-level-info" });

        const sessionWrap = content.createDiv({ cls: "tt-section tt-session-section" });
        this.sessionDiv = sessionWrap.createDiv({ cls: "tt-session" });

        this.footerDiv = container.createDiv({ cls: "tt-footer" });
        this.footerDiv.setText(t(this.plugin, "by"));

        this.updateTimes();
        injectConfetti();
        this.injectStyles();
    }

    updateTimes() {
        // 保证“累计用时”能多语言切换
        if (this.totalLabelDiv) this.totalLabelDiv.setText(t(this.plugin, "total"));

        const totalTime = this.plugin.getTotalTime();
        const sessionTime = this.plugin.getSessionTime();
        const hoursPerLevel = this.plugin.settings.levelUpHours;
        const level = Math.max(1, Math.floor(totalTime / (hoursPerLevel * 3600000)) + 1);
        const prevLevel = this.lastLevel;

        const levelEmojis = ["⭐", "🌱", "❤️", "♟️", "🍃", "🔥", "⛰️", "💎", "👑", "🐉"];
        const infinityEmoji = "♾️";
        const iconChar = level <= 10 ? levelEmojis[level - 1] : infinityEmoji;

        this.levelDiv.innerHTML = `
            <div class="tt-level-badge-wrap">
                <span class="tt-level-badge">
                    <span class="tt-level-icon">${iconChar}</span>
                    Lv.${level}
                </span>
            </div>
        `;

        const curLvBase = (level - 1) * hoursPerLevel * 3600000;
        const nextLvBase = level * hoursPerLevel * 3600000;
        const lvProgress = Math.min(1, (totalTime - curLvBase) / (nextLvBase - curLvBase));
        this.totalBar.style.background = `linear-gradient(90deg, ${this.plugin.settings.progressBarColor} 0%, #6ec1e4 100%)`;
        animateBar(this.totalBar, parseFloat(this.totalBar.style.width) / 100 || 0, lvProgress);

        const displayText = formatTotalTime(
            totalTime,
            this.plugin.settings.prefixText,
            this.plugin.settings.showSeconds,
            this.plugin
        );
        this.totalDiv.innerHTML = `<span class="tt-num">${displayText}</span>`;
        this.totalDiv.setAttribute("title", formatDuration(totalTime, true, this.plugin));

        this.sessionDiv.innerHTML = `
            <span class="tt-session-main">
                <span class="tt-label">${t(this.plugin, "session")}</span>
                <span class="tt-time">${formatDuration(sessionTime, this.plugin.settings.showSeconds, this.plugin)}</span>
            </span>
        `;

        const percent = Math.floor(lvProgress * 100);
        const curLvUsed = totalTime - curLvBase;
        const remainMs = Math.max(0, nextLvBase - totalTime);

        this.levelInfoDiv.innerHTML = `
            <div class="tt-progress-row">
                <span class="tt-progress-label">${t(this.plugin, "levelProgress")}</span>
                <span class="tt-progress-value">${percent}%</span>
            </div>
            <div class="tt-progress-row">
                <span class="tt-progress-label">${t(this.plugin, "levelTime")}</span>
                <span class="tt-progress-value">${formatDuration(curLvUsed, this.plugin.settings.showSeconds, this.plugin)} / ${hoursPerLevel}${t(this.plugin, "hour")}</span>
            </div>
            <div class="tt-progress-row">
                <span class="tt-progress-label">${t(this.plugin, "levelNeed")}</span>
                <span class="tt-progress-value">${formatDuration(remainMs, this.plugin.settings.showSeconds, this.plugin)}</span>
            </div>
        `;

        if (this.footerDiv) {
            this.footerDiv.style.display = this.plugin.settings.showFooter ? "" : "none";
        }

        if (level > prevLevel) {
            if (this.plugin.settings.enableAudio) playAudio();
            if (this.plugin.settings.enableConfetti && window.confetti)
                window.confetti({ particleCount: 100, spread: 90, origin: { y: 0.6 } });
            appendTimelineEvent(
                this.plugin.app,
                getTimelineEvent(level, totalTime, sessionTime)
            );
        }
        this.lastLevel = level;
    }

    injectStyles() {
        if (document.getElementById("tt-custom-style-v8")) return;
        const style = document.createElement("style");
        style.id = "tt-custom-style-v8";
        style.textContent = `
            .tt-root {
                display: flex;
                flex-direction: column;
                height: 100%;
                min-height: 0;
                padding: 0 0.5em;
                box-sizing: border-box;
            }
            .tt-content {
                flex: 1 1 auto;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                min-height: 0;
                gap: clamp(4px, 2vh, 24px);
            }
            .tt-section {
                min-height: 0;
                flex-shrink: 1;
                margin: 0;
                padding: 0;
                border-radius: 0;
                background: none !important;
                box-shadow: none !important;
            }
            .tt-level-section { margin-top: 4px; }
            .tt-total-section { margin-top: 1px; }
            .tt-session-section { margin-top: 12px; }
            .tt-level-badge-wrap { text-align: center; }
            .tt-level-badge {
                display: inline-block;
                background: none !important;
                color: var(--text-normal, #222);
                border-radius: 10px;
                padding: 6px 24px;
                font-size: 1.25em;
                border: 1px solid var(--background-modifier-border, #bfd6fd);
                font-weight: bold;
                box-shadow: none !important;
                margin: 10px 0 8px 0;
                min-width: 90px;
            }
            .tt-level-icon {
                margin-right: 10px;
                font-size: 1.35em;
                vertical-align: -2px;
            }
            .tt-total {
                margin: 12px 0 6px 0;
                text-align: center;
            }
            .tt-label {
                font-size: 1em;
                color: var(--text-muted, #666);
                font-weight: normal;
            }
            .tt-total-label {
                margin: 2px 0 8px 0;
                color: var(--text-faint, #888);
                font-size: 0.99em;
                text-align: center;
            }
            .tt-num {
                font-size: 1.18em;
                color: var(--text-accent, #1769aa);
                margin-left: 4px;
                font-weight: bold;
                letter-spacing: 1px;
            }
            .tt-bar-outer {
                width: 100%;
                height: 13px;
                background: var(--background-secondary-alt,#f1f3f7);
                border-radius: 6px;
                margin: 16px auto 4px auto;
                overflow: hidden;
                box-shadow: none !important;
            }
            .tt-bar-inner {
                height: 100%;
                border-radius: 6px;
                transition: width 0.5s cubic-bezier(.48,-0.09,.47,1.15);
                width: 6%;
                min-width: 6%;
            }
            .tt-level-info {
                margin: 12px auto 0 auto;
                padding: 2px 0 6px 0;
                max-width: 340px;
                text-align: left;
                font-size: 1em;
                color: var(--text-normal, #333) !important;
                background: none !important;
                line-height: 1.7;
                font-weight: normal;
                display: block !important;
                opacity: 1 !important;
                box-shadow: none !important;
            }
            .tt-progress-row {
                display: flex;
                justify-content: space-between;
                padding: 0 16px;
                margin-bottom: 2px;
            }
            .tt-progress-label {
                color: var(--text-muted, #5b6b7d) !important;
                font-size: 0.99em;
                font-weight: normal;
            }
            .tt-progress-value {
                color: var(--text-accent, #1769aa) !important;
                font-size: 1em;
                font-weight: 600;
            }
            .tt-session-main {
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 8px;
            }
            .tt-session .tt-label { color: var(--text-muted, #607d8b); }
            .tt-session .tt-time { color: #009688; font-size: 1.1em; }
            .tt-footer {
                margin-top: auto;
                text-align: center;
                font-size: 0.85em;
                color: var(--text-faint, #bbb);
                letter-spacing: 1px;
                background: none !important;
                box-shadow: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    async onClose() {}
}