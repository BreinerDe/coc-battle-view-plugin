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

interface TemporaryInsanity {
	label: string;
	untilRound: number;
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
	temporaryInsanity?: TemporaryInsanity | null;
	isPlayer: boolean;
	weaponDrawn: boolean;
}

interface PersistedCombatant {
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
	majorWound: boolean;
	temporaryInsanity?: TemporaryInsanity | null;
	isPlayer: boolean;
	weaponDrawn: boolean;
}

interface BattleState {
	combatants: PersistedCombatant[];
	activeIndex: number;
	round: number;
	started: boolean;
}

export default class CoCBattleViewPlugin extends Plugin {
	state: BattleState | null = null;

	async onload() {
		this.state = (await this.loadData()) ?? null;

		this.registerView(
			VIEW_TYPE_COC_BATTLE,
			(leaf) => new CoCBattleView(this.app, leaf, this)
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
			if (e.key === "Enter") applyBtn.click();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

class InsanityModal extends Modal {
	private currentRound: number;
	private onSubmit: (label: string, duration: number) => void;

	constructor(
		app: App,
		currentRound: number,
		onSubmit: (label: string, duration: number) => void
	) {
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
			placeholder: "e.g. Rage, Paranoia, Faint",
		});
		labelInput.addClass("coc-battle-modal-input");

		const durationInput = contentEl.createEl("input", {
			type: "number",
			attr: { min: "1", step: "1" },
			placeholder: "Rounds",
		});
		durationInput.addClass("coc-battle-modal-input");

		const info = contentEl.createEl("p", {
			text: `Current round: ${this.currentRound}`,
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
				new Notice("Please enter an insanity label.");
				return;
			}

			if (!Number.isFinite(duration) || duration < 1) {
				new Notice("Please enter a valid duration in rounds.");
				return;
			}

			this.onSubmit(label, duration);
			this.close();
		};

		labelInput.focus();
	}

	onClose() {
		this.contentEl.empty();
	}
}

class CoCBattleView extends ItemView {
	private plugin: CoCBattleViewPlugin;

	private combatants: Combatant[] = [];
	private activeIndex = -1;
	private round = 1;
	private started = false;

	private combatantsEl!: HTMLDivElement;
	private activeStatblockEl!: HTMLDivElement;
	private roundEl!: HTMLDivElement;
	private dropZoneEl!: HTMLDivElement;

	constructor(app: App, leaf: WorkspaceLeaf, plugin: CoCBattleViewPlugin) {
		super(leaf);
		this.plugin = plugin;
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
		if (this.plugin.state) {
			await this.restoreState(this.plugin.state);
		}
		this.render();
	}
	private isPlayerFile(file: TFile): boolean {
		return file.path.includes("player");	
	}

	private async saveState() {
		const state: BattleState = {
			combatants: this.combatants.map((c) => ({
				id: c.id,
				filePath: c.filePath,
				fileName: c.fileName,
				name: c.name,
				dex: c.dex,
				maxHp: c.maxHp,
				currentHp: c.currentHp,
				sanity: c.sanity,
				move: c.move,
				damageBonus: c.damageBonus,
				majorWound: c.majorWound,
				temporaryInsanity: c.temporaryInsanity ?? null,
				isPlayer: c.isPlayer,
				weaponDrawn: c.weaponDrawn,
			})),
			activeIndex: this.activeIndex,
			round: this.round,
			started: this.started,
		};

		this.plugin.state = state;
		await this.plugin.saveData(state);
	}

	private async restoreState(state: BattleState) {
		this.combatants = [];

		for (const saved of state.combatants ?? []) {
			const file = this.app.vault.getAbstractFileByPath(saved.filePath);
			if (!(file instanceof TFile)) continue;

			const content = await this.app.vault.read(file);
			const parsed = this.parseStatblock(content);
			if (!parsed) continue;

			this.combatants.push({
				id: saved.id,
				filePath: saved.filePath,
				fileName: saved.fileName,
				name: saved.name,
				dex: saved.dex,
				maxHp: saved.maxHp,
				currentHp: saved.currentHp,
				sanity: saved.sanity,
				move: saved.move,
				damageBonus: saved.damageBonus,
				majorWound: saved.majorWound,
				temporaryInsanity: saved.temporaryInsanity ?? null,
				rawNote: content,
				rawStatblock: parsed.rawStatblock ?? "",
				attacks: parsed.attacks ?? [],
				isPlayer: this.isPlayerFile(file),
				weaponDrawn: saved.weaponDrawn ?? false,
			});
		}

		this.activeIndex = state.activeIndex ?? -1;
		this.round = state.round ?? 1;
		this.started = state.started ?? false;
		this.expireRoundEffects();

		if (this.combatants.length === 0) {
			this.activeIndex = -1;
			this.round = 1;
			this.started = false;
		} else if (this.activeIndex >= this.combatants.length) {
			this.activeIndex = this.combatants.length - 1;
		}
	}

	private render() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("coc-battle-root");

		const layout = container.createDiv({ cls: "coc-battle-layout two-col" });

		const left = layout.createDiv({ cls: "coc-battle-panel coc-battle-left" });
		const center = layout.createDiv({ cls: "coc-battle-panel coc-battle-center" });

		left.createEl("h1", { text: "Combatants", cls: "coc-battle-title" });

		this.dropZoneEl = left.createDiv({ cls: "coc-battle-dropzone" });
		this.dropZoneEl.setText("Drop markdown notes here");

		const buttonRow = left.createDiv({ cls: "coc-battle-button-row" });

		const startBtn = buttonRow.createEl("button", { text: "Start" });
		const nextBtn = buttonRow.createEl("button", { text: "Next" });
		const prevBtn = buttonRow.createEl("button", { text: "Prev" });
		const clearBtn = buttonRow.createEl("button", { text: "Clear" });
		// const addActiveBtn = buttonRow.createEl("button", { text: "Add Active Note" });

		startBtn.onclick = async () => this.startCombat();
		nextBtn.onclick = async () => this.nextTurn();
		prevBtn.onclick = async () => this.prevTurn();
		clearBtn.onclick = async () => this.clearCombat();
		// addActiveBtn.onclick = async () => this.addActiveNote();

		this.roundEl = left.createDiv({ cls: "coc-battle-round" });
		this.roundEl.setText(`Round ${this.round}`);

		this.combatantsEl = left.createDiv({ cls: "coc-battle-combatants" });

		center.createEl("h1", { text: "Active Statblock", cls: "coc-battle-title" });
		this.activeStatblockEl = center.createDiv({ cls: "coc-battle-active-statblock" });
		this.activeStatblockEl.setText("Select or add a combatant.");

		this.bindDropHandlers();
		this.renderCombatants();
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
		if (active && active.extension === "md") return active;

		return null;
	}

	private resolveFileFromText(text: string): TFile | null {
		let cleaned = text.trim();

		try {
			cleaned = decodeURIComponent(cleaned);
		} catch {}

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

		const combatant: Combatant = {
			id: `${file.path}::${Date.now()}`,
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
			temporaryInsanity: null,
			isPlayer: this.isPlayerFile(file),
			weaponDrawn: false
		};

		this.combatants.push(combatant);
		this.sortCombatants();

		if (this.activeIndex === -1) this.activeIndex = 0;
		else this.activeIndex = this.combatants.findIndex((c) => c.id === combatant.id);

		this.renderCombatants();
		this.renderActiveStatblock();
		await this.saveState();
	}
	private getInitiativeValue(c: Combatant): number {
	return c.dex + (c.weaponDrawn ? 50 : 0);
	}

	private sortCombatants() {
	const activeId =
		this.activeIndex >= 0 && this.combatants[this.activeIndex]
			? this.combatants[this.activeIndex].id
			: null;

	this.combatants.sort((a, b) => this.getInitiativeValue(b) - this.getInitiativeValue(a));

	if (activeId) {
		this.activeIndex = this.combatants.findIndex((c) => c.id === activeId);
	}
	}

	private expireRoundEffects() {
		for (const c of this.combatants) {
			if (c.temporaryInsanity && this.round > c.temporaryInsanity.untilRound) {
				c.temporaryInsanity = null;
			}
		}
	}

	private async startCombat() {
		if (this.combatants.length === 0) {
			new Notice("No combatants yet.");
			return;
		}

		this.started = true;
		this.activeIndex = 0;
		this.round = 1;
		this.expireRoundEffects();

		this.renderCombatants();
		this.renderActiveStatblock();
		await this.saveState();
	}

	private async nextTurn() {
		if (this.combatants.length === 0) return;
		if (!this.started) this.started = true;

		this.activeIndex++;
		if (this.activeIndex >= this.combatants.length) {
			this.activeIndex = 0;
			this.round++;
			this.expireRoundEffects();
		}

		this.renderCombatants();
		this.renderActiveStatblock();
		await this.saveState();
	}

	private async prevTurn() {
		if (this.combatants.length === 0) return;
		if (!this.started) this.started = true;

		this.activeIndex--;
		if (this.activeIndex < 0) {
			this.activeIndex = this.combatants.length - 1;
			this.round = Math.max(1, this.round - 1);
			this.expireRoundEffects();
		}

		this.renderCombatants();
		this.renderActiveStatblock();
		await this.saveState();
	}

	private async clearCombat() {
		const players = this.combatants
		.filter((c) => c.isPlayer)
		.map((c) => ({
			...c,
			weaponDrawn: false,
		}));
		this.combatants = players;
		this.round = 1;
		this.started = false;

		if (this.combatants.length === 0) {
			this.activeIndex = -1;
		} else {
			this.sortCombatants();
			this.activeIndex = 0;
		}

		this.renderCombatants();
		this.renderActiveStatblock();
		await this.saveState();
	}

	private getMajorWoundThreshold(c: Combatant): number {
		return Math.ceil(c.maxHp / 2);
	}

	private getStatus(c: Combatant): CombatStatus {
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

	private async applyDamage(index: number, amount: number) {
		const c = this.combatants[index];
		if (!c) return;

		if (amount >= this.getMajorWoundThreshold(c)) c.majorWound = true;
		c.currentHp = Math.max(-c.maxHp, c.currentHp - amount);

		this.renderCombatants();
		this.renderActiveStatblock();
		await this.saveState();
	}

	private async applyHeal(index: number, amount: number) {
		const c = this.combatants[index];
		if (!c) return;

		c.currentHp = Math.min(c.maxHp, c.currentHp + amount);
		this.renderCombatants();
		this.renderActiveStatblock();
		await this.saveState();
	}

	private async toggleMajorWound(index: number) {
		const c = this.combatants[index];
		if (!c) return;

		c.majorWound = !c.majorWound;

		this.renderCombatants();
		this.renderActiveStatblock();
		await this.saveState();
	}

	private openInsanityModal(index: number) {
		new InsanityModal(this.app, this.round, (label, duration) => {
			const c = this.combatants[index];
			if (!c) return;

			c.temporaryInsanity = {
				label,
				untilRound: this.round + duration,
			};

			this.renderCombatants();
			this.renderActiveStatblock();
			void this.saveState();
		}).open();
	}

	private async clearInsanity(index: number) {
		const c = this.combatants[index];
		if (!c) return;

		c.temporaryInsanity = null;

		this.renderCombatants();
		this.renderActiveStatblock();
		await this.saveState();
	}

	private async removeCombatant(index: number) {
		this.combatants.splice(index, 1);

		if (this.combatants.length === 0) {
			this.activeIndex = -1;
			this.started = false;
			this.round = 1;
		} else if (this.activeIndex >= this.combatants.length) {
			this.activeIndex = this.combatants.length - 1;
		}

		this.renderCombatants();
		this.renderActiveStatblock();
		await this.saveState();
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
			if (combatant.isPlayer) row.addClass("is-player");

			if (combatant.majorWound) row.addClass("has-major-wound");
			if (combatant.temporaryInsanity) row.addClass("has-insanity");
			if (status !== "normal") row.addClass(`status-${status}`);
			if (index === this.activeIndex && this.started) row.addClass("is-active");

			row.onclick = () => {
				this.activeIndex = index;
				this.renderCombatants();
				this.renderActiveStatblock();
				void this.saveState();
			};

			const top = row.createDiv({ cls: "coc-battle-row-top" });

			const left = top.createDiv({ cls: "coc-battle-row-left" });
			const right = top.createDiv({ cls: "coc-battle-row-right" });

			const initBadge = left.createSpan({
				text: `${this.getInitiativeValue(combatant)}`,
				cls: "coc-battle-init",
			});
			initBadge.title = combatant.weaponDrawn
			? `DEX ${combatant.dex} + 50 (weapon drawn)`
			: `DEX ${combatant.dex}`;

			const nameWrap = left.createDiv({ cls: "coc-battle-name-wrap" });
			nameWrap.createSpan({ text: combatant.name, cls: "coc-battle-name" });

			const badges = nameWrap.createDiv({ cls: "coc-battle-badges" });
			if (combatant.isPlayer) {
			badges.createSpan({
				text: "👤 Player",
				cls: "coc-battle-badge player",
				});
			}
			if (combatant.weaponDrawn) {
			badges.createSpan({
				text: "🔫 Weapon Drawn",
				cls: "coc-battle-badge weapon-drawn",
			});
			}

			if (combatant.majorWound) {
				badges.createSpan({
					text: "🩹 Major Wound",
					cls: "coc-battle-badge major-wound",
				});
			}

			if (combatant.temporaryInsanity) {
				badges.createSpan({
					text: `🌀 ${combatant.temporaryInsanity.label} (Until R${combatant.temporaryInsanity.untilRound})`,
					cls: "coc-battle-badge insanity",
				});
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
			const insanityBtn = actionRow.createEl("button", {
				text: combatant.temporaryInsanity ? "Clear Insanity" : "Set Insanity",
			});
			const removeBtn = actionRow.createEl("button", { text: "Remove" });
			const weaponBtn = actionRow.createEl("button", {
				text: combatant.weaponDrawn ? "Holster" : "Weapon Drawn",
			});
			damageBtn.addClass("coc-battle-action-btn");
			healBtn.addClass("coc-battle-action-btn");
			woundBtn.addClass("coc-battle-action-btn");
			insanityBtn.addClass("coc-battle-action-btn");
			weaponBtn.addClass("coc-battle-action-btn");
			removeBtn.addClass("coc-battle-action-btn", "danger");

			damageBtn.onclick = (e) => {
				e.stopPropagation();
				new NumberInputModal(this.app, "Add Damage", "Apply", (value) => {
					void this.applyDamage(index, value);
				}).open();
			};

			healBtn.onclick = (e) => {
				e.stopPropagation();
				new NumberInputModal(this.app, "Heal", "Apply", (value) => {
					void this.applyHeal(index, value);
				}).open();
			};

			woundBtn.onclick = (e) => {
				e.stopPropagation();
				void this.toggleMajorWound(index);
			};

			insanityBtn.onclick = (e) => {
				e.stopPropagation();
				if (combatant.temporaryInsanity) void this.clearInsanity(index);
				else this.openInsanityModal(index);
			};
			weaponBtn.onclick = (e) => {
				e.stopPropagation();
				void this.toggleWeaponDrawn(index);
			};
			removeBtn.onclick = (e) => {
				e.stopPropagation();
				void this.removeCombatant(index);
			};
		});
	}
	private async toggleWeaponDrawn(index: number) {
		const c = this.combatants[index];
		if (!c) return;

		c.weaponDrawn = !c.weaponDrawn;

		this.sortCombatants();
		this.renderCombatants();
		this.renderActiveStatblock();
		await this.saveState();
	}

	private async renderActiveStatblock() {
		this.activeStatblockEl.empty();

		if (this.activeIndex < 0 || !this.combatants[this.activeIndex]) {
			this.activeStatblockEl.setText("Select or add a combatant.");
			return;
		}

		const c = this.combatants[this.activeIndex];
		const status = this.getStatus(c);

		const noteWrapper = this.activeStatblockEl.createDiv({
			cls: "coc-battle-note-wrapper",
		});

		// const stateBar = noteWrapper.createDiv({ cls: "coc-battle-statebar" });
		// stateBar.createSpan({
		// 	text: `Current HP: ${c.currentHp}/${c.maxHp}`,
		// 	cls: "coc-battle-statebar-item",
		// });

		// if (c.majorWound) {
		// 	stateBar.createSpan({
		// 		text: "🩹 Major Wound",
		// 		cls: "coc-battle-statebar-item major-wound",
		// 	});
		// }

		// if (c.temporaryInsanity) {
		// 	stateBar.createSpan({
		// 		text: `🌀 ${c.temporaryInsanity.label} (bis R${c.temporaryInsanity.untilRound})`,
		// 		cls: "coc-battle-statebar-item insanity",
		// 	});
		// }

		// if (status !== "normal") {
		// 	stateBar.createSpan({
		// 		text: `${this.getStatusIcon(status)} ${this.getStatusLabel(status)}`,
		// 		cls: `coc-battle-statebar-item status ${status}`,
		// 	});
		// }

		// const controls = noteWrapper.createDiv({ cls: "coc-battle-inline-controls" });

		// const damageBtn = controls.createEl("button", { text: "Damage" });
		// const healBtn = controls.createEl("button", { text: "Heal" });
		// const woundBtn = controls.createEl("button", {
		// 	text: c.majorWound ? "Clear Wound" : "Set Wound",
		// });
		// const insanityBtn = controls.createEl("button", {
		// 	text: c.temporaryInsanity ? "Clear Insanity" : "Set Insanity",
		// });
		// const prevBtn = controls.createEl("button", { text: "Prev" });
		// const nextBtn = controls.createEl("button", { text: "Next" });

		// damageBtn.onclick = () =>
		// 	new NumberInputModal(this.app, "Add Damage", "Apply", (value) => {
		// 		void this.applyDamage(this.activeIndex, value);
		// 	}).open();

		// healBtn.onclick = () =>
		// 	new NumberInputModal(this.app, "Heal", "Apply", (value) => {
		// 		void this.applyHeal(this.activeIndex, value);
		// 	}).open();

		// woundBtn.onclick = () => void this.toggleMajorWound(this.activeIndex);

		// insanityBtn.onclick = () => {
		// 	if (c.temporaryInsanity) void this.clearInsanity(this.activeIndex);
		// 	else this.openInsanityModal(this.activeIndex);
		// };

		// prevBtn.onclick = () => void this.prevTurn();
		// nextBtn.onclick = () => void this.nextTurn();

		// if (!c.rawStatblock?.trim()) {
		// 	noteWrapper.createEl("p", { text: "No statblock found." });
		// 	return;
		// }

		const fakeMarkdown = ["```statblock", c.rawStatblock.trim(), "```"].join("\n");
		await MarkdownRenderer.renderMarkdown(fakeMarkdown, noteWrapper, c.filePath, null);
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