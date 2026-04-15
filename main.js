var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => CoCBattleViewPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var VIEW_TYPE_COC_BATTLE = "coc-battle-view";
var CoCBattleViewPlugin = class extends import_obsidian.Plugin {
  async onload() {
    this.registerView(
      VIEW_TYPE_COC_BATTLE,
      (leaf) => new CoCBattleView(this.app, leaf)
    );
    this.addCommand({
      id: "open-coc-battle-view",
      name: "Open CoC Battle View",
      callback: async () => {
        await this.activateViewInMainArea();
      }
    });
    this.addRibbonIcon("swords", "Open CoC Battle View", async () => {
      await this.activateViewInMainArea();
    });
  }
  async activateViewInMainArea() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_COC_BATTLE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      if (!leaf) return;
      await leaf.setViewState({
        type: VIEW_TYPE_COC_BATTLE,
        active: true
      });
    }
    workspace.revealLeaf(leaf);
  }
  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_COC_BATTLE);
  }
};
var NumberInputModal = class extends import_obsidian.Modal {
  titleText;
  buttonText;
  onSubmit;
  constructor(app, titleText, buttonText, onSubmit) {
    super(app);
    this.titleText = titleText;
    this.buttonText = buttonText;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.titleText });
    const input = contentEl.createEl("input", {
      type: "number",
      attr: { min: "0", step: "1" }
    });
    input.addClass("coc-battle-modal-input");
    input.focus();
    const buttons = contentEl.createDiv({ cls: "coc-battle-modal-buttons" });
    const cancelBtn = buttons.createEl("button", { text: "Cancel" });
    const applyBtn = buttons.createEl("button", { text: this.buttonText });
    applyBtn.addClass("mod-cta");
    cancelBtn.onclick = () => this.close();
    applyBtn.onclick = () => {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < 0) {
        new import_obsidian.Notice("Please enter a valid number.");
        return;
      }
      this.onSubmit(value);
      this.close();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") applyBtn.click();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var InsanityModal = class extends import_obsidian.Modal {
  currentRound;
  onSubmit;
  constructor(app, currentRound, onSubmit) {
    super(app);
    this.currentRound = currentRound;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Set Temporary Insanity" });
    const labelInput = contentEl.createEl("input", {
      type: "text",
      placeholder: "e.g. Raserei, Panische Flucht, Erstarren"
    });
    labelInput.addClass("coc-battle-modal-input");
    const durationInput = contentEl.createEl("input", {
      type: "number",
      attr: { min: "1", step: "1" },
      placeholder: "Rounds"
    });
    durationInput.addClass("coc-battle-modal-input");
    const info = contentEl.createEl("p", {
      text: `Current round: ${this.currentRound}`
    });
    info.addClass("coc-battle-modal-help");
    const buttons = contentEl.createDiv({ cls: "coc-battle-modal-buttons" });
    const cancelBtn = buttons.createEl("button", { text: "Cancel" });
    const applyBtn = buttons.createEl("button", { text: "Apply" });
    applyBtn.addClass("mod-cta");
    cancelBtn.onclick = () => this.close();
    applyBtn.onclick = () => {
      const label = labelInput.value.trim();
      const duration = Number(durationInput.value);
      if (!label) {
        new import_obsidian.Notice("Please enter an insanity label.");
        return;
      }
      if (!Number.isFinite(duration) || duration < 1) {
        new import_obsidian.Notice("Please enter a valid duration in rounds.");
        return;
      }
      this.onSubmit(label, duration);
      this.close();
    };
    labelInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") durationInput.focus();
    });
    durationInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") applyBtn.click();
    });
    labelInput.focus();
  }
  onClose() {
    this.contentEl.empty();
  }
};
var CoCBattleView = class extends import_obsidian.ItemView {
  combatants = [];
  activeIndex = -1;
  round = 1;
  started = false;
  combatantsEl;
  activeStatblockEl;
  turnToolsEl;
  roundEl;
  dropZoneEl;
  constructor(app, leaf) {
    super(leaf);
  }
  getViewType() {
    return VIEW_TYPE_COC_BATTLE;
  }
  getDisplayText() {
    return "CoC Battle View";
  }
  getIcon() {
    return "swords";
  }
  async onOpen() {
    this.render();
  }
  async onClose() {
  }
  render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("coc-battle-root");
    const layout = container.createDiv({ cls: "coc-battle-layout" });
    const left = layout.createDiv({ cls: "coc-battle-panel coc-battle-left" });
    const center = layout.createDiv({ cls: "coc-battle-panel coc-battle-center" });
    const right = layout.createDiv({ cls: "coc-battle-panel coc-battle-right" });
    left.createEl("h1", { text: "Combatants", cls: "coc-battle-title" });
    this.dropZoneEl = left.createDiv({ cls: "coc-battle-dropzone" });
    this.dropZoneEl.setText("Drop markdown notes here");
    const buttonRow = left.createDiv({ cls: "coc-battle-button-row" });
    const startBtn = buttonRow.createEl("button", { text: "Start" });
    const nextBtn = buttonRow.createEl("button", { text: "Next" });
    const prevBtn = buttonRow.createEl("button", { text: "Prev" });
    const clearBtn = buttonRow.createEl("button", { text: "Clear" });
    const addActiveBtn = buttonRow.createEl("button", { text: "Add Active Note" });
    startBtn.onclick = () => this.startCombat();
    nextBtn.onclick = () => this.nextTurn();
    prevBtn.onclick = () => this.prevTurn();
    clearBtn.onclick = () => this.clearCombat();
    addActiveBtn.onclick = async () => this.addActiveNote();
    this.roundEl = left.createDiv({ cls: "coc-battle-round" });
    this.roundEl.setText(`Round ${this.round}`);
    this.combatantsEl = left.createDiv({ cls: "coc-battle-combatants" });
    center.createEl("h1", { text: "Active Statblock", cls: "coc-battle-title" });
    this.activeStatblockEl = center.createDiv({ cls: "coc-battle-active-statblock" });
    this.activeStatblockEl.setText("Select or add a combatant.");
    right.createEl("h1", { text: "Turn Tools", cls: "coc-battle-title" });
    this.turnToolsEl = right.createDiv({ cls: "coc-battle-turn-tools" });
    this.turnToolsEl.setText("Select a combatant to edit HP.");
    this.bindDropHandlers();
    this.renderCombatants();
    this.renderTurnTools();
    this.renderActiveStatblock();
  }
  bindDropHandlers() {
    const dz = this.dropZoneEl;
    dz.addEventListener("dragover", (e) => {
      e.preventDefault();
      dz.addClass("is-dragover");
    });
    dz.addEventListener("dragleave", () => {
      dz.removeClass("is-dragover");
    });
    dz.addEventListener("drop", async (e) => {
      e.preventDefault();
      dz.removeClass("is-dragover");
      const file = await this.resolveDroppedFile(e);
      if (!file) {
        new import_obsidian.Notice("Drop a markdown note from the vault.");
        return;
      }
      await this.addCombatantFromFile(file);
    });
  }
  async resolveDroppedFile(e) {
    const dt = e.dataTransfer;
    if (!dt) return null;
    const plain = dt.getData("text/plain")?.trim();
    if (plain) {
      const resolved = this.resolveFileFromText(plain);
      if (resolved) return resolved;
    }
    const uriList = dt.getData("text/uri-list")?.trim();
    if (uriList) {
      const resolved = this.resolveFileFromText(uriList);
      if (resolved) return resolved;
    }
    const active = this.app.workspace.getActiveFile();
    if (active && active.extension === "md") {
      return active;
    }
    return null;
  }
  resolveFileFromText(text) {
    let cleaned = text.trim();
    try {
      cleaned = decodeURIComponent(cleaned);
    } catch {
    }
    const wikiMatch = cleaned.match(/^\[\[(.+?)\]\]$/);
    if (wikiMatch) {
      const inner = wikiMatch[1];
      const pathCandidate = inner.endsWith(".md") ? inner : `${inner}.md`;
      const exact = this.app.vault.getAbstractFileByPath(pathCandidate);
      if (exact instanceof import_obsidian.TFile) return exact;
      const byBasename2 = this.app.vault.getMarkdownFiles().find((f) => f.basename === inner);
      if (byBasename2) return byBasename2;
    }
    const byBasename = this.app.vault.getMarkdownFiles().find((f) => f.basename === cleaned);
    if (byBasename) return byBasename;
    const explicit = this.app.vault.getAbstractFileByPath(cleaned);
    if (explicit instanceof import_obsidian.TFile) return explicit;
    const explicitMd = this.app.vault.getAbstractFileByPath(
      cleaned.endsWith(".md") ? cleaned : `${cleaned}.md`
    );
    if (explicitMd instanceof import_obsidian.TFile) return explicitMd;
    const maybeName = cleaned.split("/").pop()?.replace(/\.md$/i, "");
    if (maybeName) {
      const fromEnd = this.app.vault.getMarkdownFiles().find((f) => f.basename === maybeName);
      if (fromEnd) return fromEnd;
    }
    return null;
  }
  async addActiveNote() {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new import_obsidian.Notice("No active markdown note.");
      return;
    }
    await this.addCombatantFromFile(file);
  }
  async addCombatantFromFile(file) {
    const content = await this.app.vault.read(file);
    const parsed = this.parseStatblock(content);
    if (!parsed) {
      new import_obsidian.Notice(`No statblock found in "${file.basename}".`);
      return;
    }
    const id = `${file.path}::${Date.now()}`;
    const combatant = {
      id,
      filePath: file.path,
      fileName: file.basename,
      name: parsed.name || file.basename,
      dex: parsed.dex ?? 0,
      maxHp: parsed.hp ?? 0,
      currentHp: parsed.hp ?? 0,
      sanity: parsed.sanity,
      move: parsed.move,
      damageBonus: parsed.damageBonus,
      attacks: parsed.attacks ?? [],
      rawNote: content,
      rawStatblock: parsed.rawStatblock ?? "",
      majorWound: false,
      temporaryInsanity: null
    };
    this.combatants.push(combatant);
    this.sortCombatants();
    if (this.activeIndex === -1) {
      this.activeIndex = 0;
    } else {
      this.activeIndex = this.combatants.findIndex((c) => c.id === combatant.id);
    }
    this.renderCombatants();
    this.renderTurnTools();
    this.renderActiveStatblock();
  }
  sortCombatants() {
    this.combatants.sort((a, b) => b.dex - a.dex);
  }
  expireRoundEffects() {
    for (const c of this.combatants) {
      if (c.temporaryInsanity && this.round > c.temporaryInsanity.untilRound) {
        c.temporaryInsanity = null;
      }
    }
  }
  startCombat() {
    if (this.combatants.length === 0) {
      new import_obsidian.Notice("No combatants yet.");
      return;
    }
    this.started = true;
    this.activeIndex = 0;
    this.round = 1;
    this.expireRoundEffects();
    this.renderCombatants();
    this.renderTurnTools();
    this.renderActiveStatblock();
  }
  nextTurn() {
    if (this.combatants.length === 0) return;
    if (!this.started) this.started = true;
    this.activeIndex++;
    if (this.activeIndex >= this.combatants.length) {
      this.activeIndex = 0;
      this.round++;
      this.expireRoundEffects();
    }
    this.renderCombatants();
    this.renderTurnTools();
    this.renderActiveStatblock();
  }
  prevTurn() {
    if (this.combatants.length === 0) return;
    if (!this.started) this.started = true;
    this.activeIndex--;
    if (this.activeIndex < 0) {
      this.activeIndex = this.combatants.length - 1;
      this.round = Math.max(1, this.round - 1);
      this.expireRoundEffects();
    }
    this.renderCombatants();
    this.renderTurnTools();
    this.renderActiveStatblock();
  }
  clearCombat() {
    this.combatants = [];
    this.activeIndex = -1;
    this.round = 1;
    this.started = false;
    this.renderCombatants();
    this.renderTurnTools();
    this.renderActiveStatblock();
  }
  getMajorWoundThreshold(c) {
    return Math.ceil(c.maxHp / 2);
  }
  getStatus(c) {
    if (c.currentHp <= -c.maxHp) return "dead";
    if (c.currentHp <= 0 && c.majorWound) return "dying";
    if (c.currentHp <= 0) return "unconscious";
    return "normal";
  }
  getStatusLabel(status) {
    switch (status) {
      case "dead":
        return "Dead";
      case "dying":
        return "Dying";
      case "unconscious":
        return "Unconscious";
      default:
        return "OK";
    }
  }
  getStatusIcon(status) {
    switch (status) {
      case "dead":
        return "\u2620";
      case "dying":
        return "\u{1FA78}";
      case "unconscious":
        return "\u{1F4A4}";
      default:
        return "";
    }
  }
  renderCombatants() {
    this.combatantsEl.empty();
    this.roundEl.setText(`Round ${this.round}`);
    if (this.combatants.length === 0) {
      this.combatantsEl.createEl("p", { text: "No combatants yet." });
      return;
    }
    this.combatants.forEach((combatant, index) => {
      const status = this.getStatus(combatant);
      const row = this.combatantsEl.createDiv({ cls: "coc-battle-combatant-row" });
      if (index === this.activeIndex && this.started) {
        row.addClass("is-active");
      }
      if (status !== "normal") {
        row.addClass(`status-${status}`);
      }
      row.onclick = () => {
        this.activeIndex = index;
        this.renderCombatants();
        this.renderTurnTools();
        this.renderActiveStatblock();
      };
      const top = row.createDiv({ cls: "coc-battle-row-top" });
      const left = top.createDiv({ cls: "coc-battle-row-left" });
      const right = top.createDiv({ cls: "coc-battle-row-right" });
      const initBadge = left.createSpan({
        text: `${combatant.dex}`,
        cls: "coc-battle-init"
      });
      initBadge.title = "DEX / initiative";
      const nameWrap = left.createDiv({ cls: "coc-battle-name-wrap" });
      nameWrap.createSpan({ text: combatant.name, cls: "coc-battle-name" });
      const badges = nameWrap.createDiv({ cls: "coc-battle-badges" });
      if (combatant.majorWound) {
        const mw = badges.createSpan({
          text: "\u{1FA79} Major Wound",
          cls: "coc-battle-badge major-wound"
        });
        mw.title = `Triggered by a single hit of ${this.getMajorWoundThreshold(
          combatant
        )}+ damage`;
      }
      if (combatant.temporaryInsanity) {
        badges.createSpan({
          text: `\u{1F300} ${combatant.temporaryInsanity.label} (bis R${combatant.temporaryInsanity.untilRound})`,
          cls: "coc-battle-badge insanity"
        });
      }
      if (status !== "normal") {
        badges.createSpan({
          text: `${this.getStatusIcon(status)} ${this.getStatusLabel(status)}`,
          cls: `coc-battle-badge status ${status}`
        });
      }
      right.createSpan({
        text: `${combatant.currentHp}/${combatant.maxHp} HP`,
        cls: "coc-battle-hp"
      });
      const actionRow = row.createDiv({ cls: "coc-battle-row-actions" });
      const damageBtn = actionRow.createEl("button", { text: "Damage" });
      const healBtn = actionRow.createEl("button", { text: "Heal" });
      const woundBtn = actionRow.createEl("button", {
        text: combatant.majorWound ? "Clear Wound" : "Set Wound"
      });
      const insanityBtn = actionRow.createEl("button", {
        text: combatant.temporaryInsanity ? "Clear Insanity" : "Set Insanity"
      });
      const removeBtn = actionRow.createEl("button", { text: "Remove" });
      damageBtn.addClass("coc-battle-action-btn");
      healBtn.addClass("coc-battle-action-btn");
      woundBtn.addClass("coc-battle-action-btn");
      insanityBtn.addClass("coc-battle-action-btn");
      removeBtn.addClass("coc-battle-action-btn", "danger");
      damageBtn.onclick = (e) => {
        e.stopPropagation();
        new NumberInputModal(this.app, "Add Damage", "Apply", (value) => {
          this.applyDamage(index, value);
        }).open();
      };
      healBtn.onclick = (e) => {
        e.stopPropagation();
        new NumberInputModal(this.app, "Heal", "Apply", (value) => {
          this.applyHeal(index, value);
        }).open();
      };
      woundBtn.onclick = (e) => {
        e.stopPropagation();
        this.toggleMajorWound(index);
      };
      insanityBtn.onclick = (e) => {
        e.stopPropagation();
        if (combatant.temporaryInsanity) {
          this.clearInsanity(index);
        } else {
          this.openInsanityModal(index);
        }
      };
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        this.removeCombatant(index);
      };
    });
  }
  applyDamage(index, amount) {
    const c = this.combatants[index];
    if (!c) return;
    if (amount >= this.getMajorWoundThreshold(c)) {
      c.majorWound = true;
    }
    c.currentHp = Math.max(-c.maxHp, c.currentHp - amount);
    this.renderCombatants();
    this.renderTurnTools();
    this.renderActiveStatblock();
  }
  applyHeal(index, amount) {
    const c = this.combatants[index];
    if (!c) return;
    c.currentHp = Math.min(c.maxHp, c.currentHp + amount);
    this.renderCombatants();
    this.renderTurnTools();
    this.renderActiveStatblock();
  }
  toggleMajorWound(index) {
    const c = this.combatants[index];
    if (!c) return;
    c.majorWound = !c.majorWound;
    this.renderCombatants();
    this.renderTurnTools();
    this.renderActiveStatblock();
  }
  openInsanityModal(index) {
    new InsanityModal(this.app, this.round, (label, duration) => {
      const c = this.combatants[index];
      if (!c) return;
      c.temporaryInsanity = {
        label,
        untilRound: this.round + duration
      };
      this.renderCombatants();
      this.renderTurnTools();
      this.renderActiveStatblock();
    }).open();
  }
  clearInsanity(index) {
    const c = this.combatants[index];
    if (!c) return;
    c.temporaryInsanity = null;
    this.renderCombatants();
    this.renderTurnTools();
    this.renderActiveStatblock();
  }
  removeCombatant(index) {
    this.combatants.splice(index, 1);
    if (this.combatants.length === 0) {
      this.activeIndex = -1;
      this.started = false;
      this.round = 1;
    } else if (this.activeIndex >= this.combatants.length) {
      this.activeIndex = this.combatants.length - 1;
    }
    this.renderCombatants();
    this.renderTurnTools();
    this.renderActiveStatblock();
  }
  renderTurnTools() {
    this.turnToolsEl.empty();
    if (this.activeIndex < 0 || !this.combatants[this.activeIndex]) {
      this.turnToolsEl.setText("Select a combatant to edit HP.");
      return;
    }
    const c = this.combatants[this.activeIndex];
    const status = this.getStatus(c);
    this.turnToolsEl.createEl("h2", {
      text: c.name,
      cls: "coc-battle-turn-name"
    });
    const badges = this.turnToolsEl.createDiv({ cls: "coc-battle-turn-badges" });
    if (c.majorWound) {
      badges.createSpan({
        text: "\u{1FA79} Major Wound",
        cls: "coc-battle-badge major-wound"
      });
    }
    if (c.temporaryInsanity) {
      badges.createSpan({
        text: `\u{1F300} ${c.temporaryInsanity.label} (bis R${c.temporaryInsanity.untilRound})`,
        cls: "coc-battle-badge insanity"
      });
    }
    if (status !== "normal") {
      badges.createSpan({
        text: `${this.getStatusIcon(status)} ${this.getStatusLabel(status)}`,
        cls: `coc-battle-badge status ${status}`
      });
    }
    this.turnToolsEl.createDiv({
      text: `HP ${c.currentHp}/${c.maxHp}`,
      cls: "coc-battle-turn-hp"
    });
    const controls = this.turnToolsEl.createDiv({ cls: "coc-battle-hp-controls" });
    const minus1 = controls.createEl("button", { text: "-1" });
    const minusD3 = controls.createEl("button", { text: "-1d3" });
    const minusD6 = controls.createEl("button", { text: "-1d6" });
    const manualDmg = controls.createEl("button", { text: "Damage..." });
    const heal1 = controls.createEl("button", { text: "+1" });
    const manualHeal = controls.createEl("button", { text: "Heal..." });
    const woundToggle = controls.createEl("button", {
      text: c.majorWound ? "Clear Wound" : "Set Wound"
    });
    const insanityToggle = controls.createEl("button", {
      text: c.temporaryInsanity ? "Clear Insanity" : "Set Insanity"
    });
    minus1.onclick = () => this.changeHp(-1);
    minusD3.onclick = () => this.changeHp(-this.rollDie(3));
    minusD6.onclick = () => this.changeHp(-this.rollDie(6));
    manualDmg.onclick = () => new NumberInputModal(
      this.app,
      "Add Damage",
      "Apply",
      (value) => this.changeHp(-value, true)
    ).open();
    heal1.onclick = () => this.changeHp(1);
    manualHeal.onclick = () => new NumberInputModal(
      this.app,
      "Heal",
      "Apply",
      (value) => this.changeHp(value)
    ).open();
    woundToggle.onclick = () => {
      this.toggleMajorWound(this.activeIndex);
    };
    insanityToggle.onclick = () => {
      if (c.temporaryInsanity) {
        this.clearInsanity(this.activeIndex);
      } else {
        this.openInsanityModal(this.activeIndex);
      }
    };
    if (c.attacks.length > 0) {
      this.turnToolsEl.createEl("h3", {
        text: "Attacks",
        cls: "coc-battle-subtitle"
      });
      const attackList = this.turnToolsEl.createDiv({ cls: "coc-battle-attack-list" });
      c.attacks.forEach((atk) => {
        const atkRow = attackList.createDiv({ cls: "coc-battle-attack-row" });
        atkRow.createEl("strong", { text: atk.name });
        atkRow.createEl("div", { text: atk.desc });
      });
    }
  }
  changeHp(delta, treatAsSingleHit = false) {
    if (this.activeIndex < 0 || !this.combatants[this.activeIndex]) return;
    const c = this.combatants[this.activeIndex];
    if (delta < 0 && treatAsSingleHit && Math.abs(delta) >= this.getMajorWoundThreshold(c)) {
      c.majorWound = true;
    }
    c.currentHp = Math.max(-c.maxHp, Math.min(c.maxHp, c.currentHp + delta));
    this.renderCombatants();
    this.renderTurnTools();
    this.renderActiveStatblock();
  }
  async renderActiveStatblock() {
    this.activeStatblockEl.empty();
    if (this.activeIndex < 0 || !this.combatants[this.activeIndex]) {
      this.activeStatblockEl.setText("Select or add a combatant.");
      return;
    }
    const c = this.combatants[this.activeIndex];
    const status = this.getStatus(c);
    const noteWrapper = this.activeStatblockEl.createDiv({
      cls: "coc-battle-note-wrapper"
    });
    if (!c.rawStatblock?.trim()) {
      noteWrapper.setText("No statblock found.");
      return;
    }
    const stateBar = noteWrapper.createDiv({ cls: "coc-battle-statebar" });
    stateBar.createSpan({
      text: `Current HP: ${c.currentHp}/${c.maxHp}`,
      cls: "coc-battle-statebar-item"
    });
    if (c.majorWound) {
      stateBar.createSpan({
        text: "\u{1FA79} Major Wound",
        cls: "coc-battle-statebar-item major-wound"
      });
    }
    if (c.temporaryInsanity) {
      stateBar.createSpan({
        text: `\u{1F300} ${c.temporaryInsanity.label} (bis R${c.temporaryInsanity.untilRound})`,
        cls: "coc-battle-statebar-item insanity"
      });
    }
    if (status !== "normal") {
      stateBar.createSpan({
        text: `${this.getStatusIcon(status)} ${this.getStatusLabel(status)}`,
        cls: `coc-battle-statebar-item status ${status}`
      });
    }
    const fakeMarkdown = [
      "```statblock",
      c.rawStatblock.trim(),
      "```"
    ].join("\n");
    await import_obsidian.MarkdownRenderer.renderMarkdown(
      fakeMarkdown,
      noteWrapper,
      c.filePath,
      null
    );
  }
  rollDie(sides) {
    return Math.floor(Math.random() * sides) + 1;
  }
  parseStatblock(content) {
    const blockMatch = content.match(/```statblock\s*([\s\S]*?)```/i);
    if (!blockMatch) return null;
    const block = blockMatch[1];
    const readString = (regex) => {
      const m = block.match(regex);
      return m?.[1]?.trim();
    };
    const readNumber = (regex) => {
      const m = block.match(regex);
      if (!m?.[1]) return void 0;
      const n = Number(m[1]);
      return Number.isFinite(n) ? n : void 0;
    };
    const name = readString(/^\s*name:\s*"([^"]+)"/im) ?? readString(/^\s*name:\s*([^\n]+)/im);
    const dex = readNumber(/^\s*-\s*dex:\s*([0-9]+)/im);
    const hp = readNumber(/^\s*hp:\s*([0-9]+)/im);
    const sanity = readNumber(/^\s*sanity:\s*([0-9]+)/im);
    const move = readNumber(/^\s*move:\s*([0-9]+)/im);
    const damageBonus = readString(/^\s*damage bonus:\s*"([^"]+)"/im) ?? readString(/^\s*damage bonus:\s*([^\n]+)/im);
    const attacks = [];
    const combatSectionMatch = block.match(/^\s*combat:\s*([\s\S]*?)(?:^\s*skills:|$)/im);
    if (combatSectionMatch) {
      const combatSection = combatSectionMatch[1];
      const attackRegex = /^\s*-\s*name:\s*"([^"]+)"\s*[\r\n]+\s*desc:\s*"([^"]+)"/gim;
      let match;
      while ((match = attackRegex.exec(combatSection)) !== null) {
        attacks.push({
          name: match[1],
          desc: match[2]
        });
      }
    }
    return {
      name,
      dex,
      hp,
      sanity,
      move,
      damageBonus,
      attacks,
      rawStatblock: block
    };
  }
};
