import {
	App,
	ItemView,
	MarkdownRenderer,
	Modal,
	Notice,
	Plugin,
	TFile,
	WorkspaceLeaf,
} from "obsidian";

const VIEW_TYPE_COC_BATTLE = "coc-battle-view";

type CombatStatus = "normal" | "unconscious" | "dying" | "dead";

interface CombatAttack {
	name: string;
	desc: string;
}

interface Combatant {
	id: string;
	filePath: string;
	fileName: string;
	name: string;
	dex: number;
	maxHp: number;
	currentHp: number;
	sanity?: number;
	move?: number;
	damageBonus?: string;
	attacks: CombatAttack[];
	rawNote: string;
	rawStatblock: string;
	majorWound: boolean;
}

export default class CoCBattleViewPlugin extends Plugin {
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
			},
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
				active: true,
			});
		}

		workspace.revealLeaf(leaf);
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_COC_BATTLE);
	}
}

class NumberInputModal extends Modal {
	private titleText: string;
	private buttonText: string;
	private onSubmit: (value: number) => void;

	constructor(
		app: App,
		titleText: string,
		buttonText: string,
		onSubmit: (value: number) => void
	) {
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
			attr: { min: "0", step: "1" },
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
				new Notice("Please enter a valid number.");
				return;
			}
			this.onSubmit(value);
			this.close();
		};

		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				applyBtn.click();
			}
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

class CoCBattleView extends ItemView {
	private combatants: Combatant[] = [];
	private activeIndex = -1;
	private round = 1;
	private started = false;

	private combatantsEl!: HTMLDivElement;
	private activeStatblockEl!: HTMLDivElement;
	private turnToolsEl!: HTMLDivElement;
	private roundEl!: HTMLDivElement;
	private dropZoneEl!: HTMLDivElement;

	constructor(app: App, leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_COC_BATTLE;
	}

	getDisplayText(): string {
		return "CoC Battle View";
	}

	getIcon(): string {
		return "swords";
	}

	async onOpen() {
		this.render();
	}

	async onClose() {
		// nothing
	}

	private render() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("coc-battle-root");

		const layout = container.createDiv({ cls: "coc-battle-layout" });

		const left = layout.createDiv({ cls: "coc-battle-panel coc-battle-left" });
		const center = layout.createDiv({ cls: "coc-battle-panel coc-battle-center" });
		const right = layout.createDiv({ cls: "coc-battle-panel coc-battle-right" });

		// LEFT
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

		// CENTER
		center.createEl("h1", { text: "Active Statblock", cls: "coc-battle-title" });
		this.activeStatblockEl = center.createDiv({ cls: "coc-battle-active-statblock" });
		this.activeStatblockEl.setText("Select or add a combatant.");

		// RIGHT
		right.createEl("h1", { text: "Turn Tools", cls: "coc-battle-title" });
		this.turnToolsEl = right.createDiv({ cls: "coc-battle-turn-tools" });
		this.turnToolsEl.setText("Select a combatant to edit HP.");

		this.bindDropHandlers();
		this.renderCombatants();
		this.renderTurnTools();
		this.renderActiveStatblock();
	}

	private bindDropHandlers() {
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
				new Notice("Drop a markdown note from the vault.");
				return;
			}

			await this.addCombatantFromFile(file);
		});
	}

	private async resolveDroppedFile(e: DragEvent): Promise<TFile | null> {
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

	private resolveFileFromText(text: string): TFile | null {
		let cleaned = text.trim();

		try {
			cleaned = decodeURIComponent(cleaned);
		} catch {
			// ignore
		}

		const wikiMatch = cleaned.match(/^\[\[(.+?)\]\]$/);
		if (wikiMatch) {
			const inner = wikiMatch[1];
			const pathCandidate = inner.endsWith(".md") ? inner : `${inner}.md`;

			const exact = this.app.vault.getAbstractFileByPath(pathCandidate);
			if (exact instanceof TFile) return exact;

			const byBasename = this.app.vault.getMarkdownFiles().find((f) => f.basename === inner);
			if (byBasename) return byBasename;
		}

		const byBasename = this.app.vault.getMarkdownFiles().find((f) => f.basename === cleaned);
		if (byBasename) return byBasename;

		const explicit = this.app.vault.getAbstractFileByPath(cleaned);
		if (explicit instanceof TFile) return explicit;

		const explicitMd = this.app.vault.getAbstractFileByPath(
			cleaned.endsWith(".md") ? cleaned : `${cleaned}.md`
		);
		if (explicitMd instanceof TFile) return explicitMd;

		const maybeName = cleaned.split("/").pop()?.replace(/\.md$/i, "");
		if (maybeName) {
			const fromEnd = this.app.vault.getMarkdownFiles().find((f) => f.basename === maybeName);
			if (fromEnd) return fromEnd;
		}

		return null;
	}

	private async addActiveNote() {
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") {
			new Notice("No active markdown note.");
			return;
		}

		await this.addCombatantFromFile(file);
	}

	private async addCombatantFromFile(file: TFile) {
		const content = await this.app.vault.read(file);
		const parsed = this.parseStatblock(content);

		if (!parsed) {
			new Notice(`No statblock found in "${file.basename}".`);
			return;
		}

		const id = `${file.path}::${Date.now()}`;

		const combatant: Combatant = {
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

	private sortCombatants() {
		this.combatants.sort((a, b) => b.dex - a.dex);
	}

	private startCombat() {
		if (this.combatants.length === 0) {
			new Notice("No combatants yet.");
			return;
		}

		this.started = true;
		this.activeIndex = 0;
		this.round = 1;

		this.renderCombatants();
		this.renderTurnTools();
		this.renderActiveStatblock();
	}

	private nextTurn() {
		if (this.combatants.length === 0) return;
		if (!this.started) this.started = true;

		this.activeIndex++;

		if (this.activeIndex >= this.combatants.length) {
			this.activeIndex = 0;
			this.round++;
		}

		this.renderCombatants();
		this.renderTurnTools();
		this.renderActiveStatblock();
	}

	private prevTurn() {
		if (this.combatants.length === 0) return;
		if (!this.started) this.started = true;

		this.activeIndex--;

		if (this.activeIndex < 0) {
			this.activeIndex = this.combatants.length - 1;
			this.round = Math.max(1, this.round - 1);
		}

		this.renderCombatants();
		this.renderTurnTools();
		this.renderActiveStatblock();
	}

	private clearCombat() {
		this.combatants = [];
		this.activeIndex = -1;
		this.round = 1;
		this.started = false;

		this.renderCombatants();
		this.renderTurnTools();
		this.renderActiveStatblock();
	}

	private getMajorWoundThreshold(c: Combatant): number {
		return Math.ceil(c.maxHp / 2);
	}

	private getStatus(c: Combatant): CombatStatus {
		// Official CoC 7e:
		// 0 HP without major wound = unconscious
		// 0 HP with major wound = dying
		// dead at -max HP or lower
		if (c.currentHp <= -c.maxHp) return "dead";
		if (c.currentHp <= 0 && c.majorWound) return "dying";
		if (c.currentHp <= 0) return "unconscious";
		return "normal";
	}

	private getStatusLabel(status: CombatStatus): string {
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

	private getStatusIcon(status: CombatStatus): string {
		switch (status) {
			case "dead":
				return "☠";
			case "dying":
				return "🩸";
			case "unconscious":
				return "💤";
			default:
				return "";
		}
	}

	private renderCombatants() {
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
				cls: "coc-battle-init",
			});
			initBadge.title = "DEX / initiative";

			const nameWrap = left.createDiv({ cls: "coc-battle-name-wrap" });
			nameWrap.createSpan({ text: combatant.name, cls: "coc-battle-name" });

			const badges = nameWrap.createDiv({ cls: "coc-battle-badges" });

			if (combatant.majorWound) {
				const mw = badges.createSpan({
					text: "🩹 Major Wound",
					cls: "coc-battle-badge major-wound",
				});
				mw.title = `Triggered by a single hit of ${this.getMajorWoundThreshold(
					combatant
				)}+ damage`;
			}

			if (status !== "normal") {
				badges.createSpan({
					text: `${this.getStatusIcon(status)} ${this.getStatusLabel(status)}`,
					cls: `coc-battle-badge status ${status}`,
				});
			}

			right.createSpan({
				text: `${combatant.currentHp}/${combatant.maxHp} HP`,
				cls: "coc-battle-hp",
			});

			const actionRow = row.createDiv({ cls: "coc-battle-row-actions" });

			const damageBtn = actionRow.createEl("button", { text: "Damage" });
			const healBtn = actionRow.createEl("button", { text: "Heal" });
			const woundBtn = actionRow.createEl("button", {
				text: combatant.majorWound ? "Clear Wound" : "Set Wound",
			});
			const removeBtn = actionRow.createEl("button", { text: "Remove" });

			damageBtn.addClass("coc-battle-action-btn");
			healBtn.addClass("coc-battle-action-btn");
			woundBtn.addClass("coc-battle-action-btn");
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

			removeBtn.onclick = (e) => {
				e.stopPropagation();
				this.removeCombatant(index);
			};
		});
	}

	private applyDamage(index: number, amount: number) {
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

	private applyHeal(index: number, amount: number) {
		const c = this.combatants[index];
		if (!c) return;

		c.currentHp = Math.min(c.maxHp, c.currentHp + amount);

		this.renderCombatants();
		this.renderTurnTools();
		this.renderActiveStatblock();
	}

	private toggleMajorWound(index: number) {
		const c = this.combatants[index];
		if (!c) return;

		c.majorWound = !c.majorWound;

		this.renderCombatants();
		this.renderTurnTools();
		this.renderActiveStatblock();
	}

	private removeCombatant(index: number) {
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

	private renderTurnTools() {
		this.turnToolsEl.empty();

		if (this.activeIndex < 0 || !this.combatants[this.activeIndex]) {
			this.turnToolsEl.setText("Select a combatant to edit HP.");
			return;
		}

		const c = this.combatants[this.activeIndex];
		const status = this.getStatus(c);

		this.turnToolsEl.createEl("h2", {
			text: c.name,
			cls: "coc-battle-turn-name",
		});

		const badges = this.turnToolsEl.createDiv({ cls: "coc-battle-turn-badges" });

		if (c.majorWound) {
			badges.createSpan({
				text: "🩹 Major Wound",
				cls: "coc-battle-badge major-wound",
			});
		}

		if (status !== "normal") {
			badges.createSpan({
				text: `${this.getStatusIcon(status)} ${this.getStatusLabel(status)}`,
				cls: `coc-battle-badge status ${status}`,
			});
		}

		this.turnToolsEl.createDiv({
			text: `HP ${c.currentHp}/${c.maxHp}`,
			cls: "coc-battle-turn-hp",
		});

		const controls = this.turnToolsEl.createDiv({ cls: "coc-battle-hp-controls" });

		const minus1 = controls.createEl("button", { text: "-1" });
		const minusD3 = controls.createEl("button", { text: "-1d3" });
		const minusD6 = controls.createEl("button", { text: "-1d6" });
		const manualDmg = controls.createEl("button", { text: "Damage..." });
		const heal1 = controls.createEl("button", { text: "+1" });
		const manualHeal = controls.createEl("button", { text: "Heal..." });
		const woundToggle = controls.createEl("button", {
			text: c.majorWound ? "Clear Wound" : "Set Wound",
		});

		minus1.onclick = () => this.changeHp(-1);
		minusD3.onclick = () => this.changeHp(-this.rollDie(3));
		minusD6.onclick = () => this.changeHp(-this.rollDie(6));
		manualDmg.onclick = () =>
			new NumberInputModal(this.app, "Add Damage", "Apply", (value) =>
				this.changeHp(-value, true)
			).open();

		heal1.onclick = () => this.changeHp(1);
		manualHeal.onclick = () =>
			new NumberInputModal(this.app, "Heal", "Apply", (value) =>
				this.changeHp(value)
			).open();

		woundToggle.onclick = () => {
			this.toggleMajorWound(this.activeIndex);
		};

		if (c.attacks.length > 0) {
			this.turnToolsEl.createEl("h3", {
				text: "Attacks",
				cls: "coc-battle-subtitle",
			});

			const attackList = this.turnToolsEl.createDiv({ cls: "coc-battle-attack-list" });

			c.attacks.forEach((atk) => {
				const atkRow = attackList.createDiv({ cls: "coc-battle-attack-row" });
				atkRow.createEl("strong", { text: atk.name });
				atkRow.createEl("div", { text: atk.desc });
			});
		}
	}

	private changeHp(delta: number, treatAsSingleHit = false) {
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

	private async renderActiveStatblock() {
		this.activeStatblockEl.empty();

		if (this.activeIndex < 0 || !this.combatants[this.activeIndex]) {
			this.activeStatblockEl.setText("Select or add a combatant.");
			return;
		}

		const c = this.combatants[this.activeIndex];

		const noteWrapper = this.activeStatblockEl.createDiv({
			cls: "coc-battle-note-wrapper",
		});

		if (!c.rawStatblock?.trim()) {
			noteWrapper.setText("No statblock found.");
			return;
		}

		const status = this.getStatus(c);

		const stateBar = noteWrapper.createDiv({ cls: "coc-battle-statebar" });
		stateBar.createSpan({
			text: `Current HP: ${c.currentHp}/${c.maxHp}`,
			cls: "coc-battle-statebar-item",
		});

		if (c.majorWound) {
			stateBar.createSpan({
				text: "🩹 Major Wound",
				cls: "coc-battle-statebar-item major-wound",
			});
		}

		if (status !== "normal") {
			stateBar.createSpan({
				text: `${this.getStatusIcon(status)} ${this.getStatusLabel(status)}`,
				cls: `coc-battle-statebar-item status ${status}`,
			});
		}

		const fakeMarkdown = [
			"```statblock",
			c.rawStatblock.trim(),
			"```",
		].join("\n");

		await MarkdownRenderer.renderMarkdown(
			fakeMarkdown,
			noteWrapper,
			c.filePath,
			null
		);
	}

	private rollDie(sides: number): number {
		return Math.floor(Math.random() * sides) + 1;
	}

	private parseStatblock(content: string): {
		name?: string;
		dex?: number;
		hp?: number;
		sanity?: number;
		move?: number;
		damageBonus?: string;
		attacks?: CombatAttack[];
		rawStatblock?: string;
	} | null {
		const blockMatch = content.match(/```statblock\s*([\s\S]*?)```/i);
		if (!blockMatch) return null;

		const block = blockMatch[1];

		const readString = (regex: RegExp): string | undefined => {
			const m = block.match(regex);
			return m?.[1]?.trim();
		};

		const readNumber = (regex: RegExp): number | undefined => {
			const m = block.match(regex);
			if (!m?.[1]) return undefined;
			const n = Number(m[1]);
			return Number.isFinite(n) ? n : undefined;
		};

		const name =
			readString(/^\s*name:\s*"([^"]+)"/im) ??
			readString(/^\s*name:\s*([^\n]+)/im);

		const dex = readNumber(/^\s*-\s*dex:\s*([0-9]+)/im);
		const hp = readNumber(/^\s*hp:\s*([0-9]+)/im);
		const sanity = readNumber(/^\s*sanity:\s*([0-9]+)/im);
		const move = readNumber(/^\s*move:\s*([0-9]+)/im);
		const damageBonus =
			readString(/^\s*damage bonus:\s*"([^"]+)"/im) ??
			readString(/^\s*damage bonus:\s*([^\n]+)/im);

		const attacks: CombatAttack[] = [];
		const combatSectionMatch = block.match(/^\s*combat:\s*([\s\S]*?)(?:^\s*skills:|$)/im);

		if (combatSectionMatch) {
			const combatSection = combatSectionMatch[1];
			const attackRegex =
				/^\s*-\s*name:\s*"([^"]+)"\s*[\r\n]+\s*desc:\s*"([^"]+)"/gim;

			let match: RegExpExecArray | null;
			while ((match = attackRegex.exec(combatSection)) !== null) {
				attacks.push({
					name: match[1],
					desc: match[2],
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
			rawStatblock: block,
		};
	}
}