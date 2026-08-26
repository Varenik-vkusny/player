//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/core.js
var e;
function t(e, t, n) {
	function r(n, r) {
		if (n._zod || Object.defineProperty(n, "_zod", {
			value: {
				def: r,
				constr: o,
				traits: /* @__PURE__ */ new Set()
			},
			enumerable: !1
		}), n._zod.traits.has(e)) return;
		n._zod.traits.add(e), t(n, r);
		let i = o.prototype, a = Object.keys(i);
		for (let e = 0; e < a.length; e++) {
			let t = a[e];
			t in n || (n[t] = i[t].bind(n));
		}
	}
	let i = n?.Parent ?? Object;
	class a extends i {}
	Object.defineProperty(a, "name", { value: e });
	function o(e) {
		var t;
		let i = n?.Parent ? new a() : this;
		r(i, e), (t = i._zod).deferred ?? (t.deferred = []);
		for (let e of i._zod.deferred) e();
		return i;
	}
	return Object.defineProperty(o, "init", { value: r }), Object.defineProperty(o, Symbol.hasInstance, { value: (t) => n?.Parent && t instanceof n.Parent ? !0 : t?._zod?.traits?.has(e) }), Object.defineProperty(o, "name", { value: e }), o;
}
var n = class extends Error {
	constructor() {
		super("Encountered Promise during synchronous parse. Use .parseAsync() instead.");
	}
}, r = class extends Error {
	constructor(e) {
		super(`Encountered unidirectional transform during encode: ${e}`), this.name = "ZodEncodeError";
	}
};
(e = globalThis).__zod_globalConfig ?? (e.__zod_globalConfig = {});
var i = globalThis.__zod_globalConfig;
function a(e) {
	return e && Object.assign(i, e), i;
}
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/util.js
function o(e) {
	let t = Object.values(e).filter((e) => typeof e == "number");
	return Object.entries(e).filter(([e, n]) => t.indexOf(+e) === -1).map(([e, t]) => t);
}
function s(e, t) {
	return typeof t == "bigint" ? t.toString() : t;
}
function c(e) {
	return { get value() {
		{
			let t = e();
			return Object.defineProperty(this, "value", { value: t }), t;
		}
		throw Error("cached value already set");
	} };
}
function l(e) {
	return e == null;
}
function u(e) {
	let t = +!!e.startsWith("^"), n = e.endsWith("$") ? e.length - 1 : e.length;
	return e.slice(t, n);
}
function d(e, t) {
	let n = e / t, r = Math.round(n), i = 2 ** -52 * Math.max(Math.abs(n), 1);
	return Math.abs(n - r) < i ? 0 : n - r;
}
var f = /* @__PURE__*/ Symbol("evaluating");
function p(e, t, n) {
	let r;
	Object.defineProperty(e, t, {
		get() {
			if (r !== f) return r === void 0 && (r = f, r = n()), r;
		},
		set(n) {
			Object.defineProperty(e, t, { value: n });
		},
		configurable: !0
	});
}
function m(e, t, n) {
	Object.defineProperty(e, t, {
		value: n,
		writable: !0,
		enumerable: !0,
		configurable: !0
	});
}
function h(...e) {
	let t = {};
	for (let n of e) {
		let e = Object.getOwnPropertyDescriptors(n);
		Object.assign(t, e);
	}
	return Object.defineProperties({}, t);
}
function g(e) {
	return JSON.stringify(e);
}
function _(e) {
	return e.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
var v = "captureStackTrace" in Error ? Error.captureStackTrace : (...e) => {};
function y(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
var b = /* @__PURE__*/ c(() => {
	if (i.jitless || typeof navigator < "u" && navigator?.userAgent?.includes("Cloudflare")) return !1;
	try {
		return Function(""), !0;
	} catch {
		return !1;
	}
});
function x(e) {
	if (y(e) === !1) return !1;
	let t = e.constructor;
	if (t === void 0 || typeof t != "function") return !0;
	let n = t.prototype;
	return !(y(n) === !1 || Object.prototype.hasOwnProperty.call(n, "isPrototypeOf") === !1);
}
function S(e) {
	return x(e) ? { ...e } : Array.isArray(e) ? [...e] : e instanceof Map ? new Map(e) : e instanceof Set ? new Set(e) : e;
}
var C = /* @__PURE__*/ new Set([
	"string",
	"number",
	"symbol"
]);
function ee(e) {
	return e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function w(e, t, n) {
	let r = new e._zod.constr(t ?? e._zod.def);
	return (!t || n?.parent) && (r._zod.parent = e), r;
}
function T(e) {
	let t = e;
	if (!t) return {};
	if (typeof t == "string") return { error: () => t };
	if (t?.message !== void 0) {
		if (t?.error !== void 0) throw Error("Cannot specify both `message` and `error` params");
		t.error = t.message;
	}
	return delete t.message, typeof t.error == "string" ? {
		...t,
		error: () => t.error
	} : t;
}
function te(e) {
	return Object.keys(e).filter((t) => e[t]._zod.optin === "optional" && e[t]._zod.optout === "optional");
}
var ne = {
	safeint: [-(2 ** 53 - 1), 2 ** 53 - 1],
	int32: [-2147483648, 2147483647],
	uint32: [0, 4294967295],
	float32: [-34028234663852886e22, 34028234663852886e22],
	float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
};
function re(e, t) {
	let n = e._zod.def, r = n.checks;
	if (r && r.length > 0) throw Error(".pick() cannot be used on object schemas containing refinements");
	return w(e, h(e._zod.def, {
		get shape() {
			let e = {};
			for (let r in t) {
				if (!(r in n.shape)) throw Error(`Unrecognized key: "${r}"`);
				t[r] && (e[r] = n.shape[r]);
			}
			return m(this, "shape", e), e;
		},
		checks: []
	}));
}
function E(e, t) {
	let n = e._zod.def, r = n.checks;
	if (r && r.length > 0) throw Error(".omit() cannot be used on object schemas containing refinements");
	return w(e, h(e._zod.def, {
		get shape() {
			let r = { ...e._zod.def.shape };
			for (let e in t) {
				if (!(e in n.shape)) throw Error(`Unrecognized key: "${e}"`);
				t[e] && delete r[e];
			}
			return m(this, "shape", r), r;
		},
		checks: []
	}));
}
function D(e, t) {
	if (!x(t)) throw Error("Invalid input to extend: expected a plain object");
	let n = e._zod.def.checks;
	if (n && n.length > 0) {
		let n = e._zod.def.shape;
		for (let e in t) if (Object.getOwnPropertyDescriptor(n, e) !== void 0) throw Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
	}
	return w(e, h(e._zod.def, { get shape() {
		let n = {
			...e._zod.def.shape,
			...t
		};
		return m(this, "shape", n), n;
	} }));
}
function ie(e, t) {
	if (!x(t)) throw Error("Invalid input to safeExtend: expected a plain object");
	return w(e, h(e._zod.def, { get shape() {
		let n = {
			...e._zod.def.shape,
			...t
		};
		return m(this, "shape", n), n;
	} }));
}
function ae(e, t) {
	if (e._zod.def.checks?.length) throw Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
	return w(e, h(e._zod.def, {
		get shape() {
			let n = {
				...e._zod.def.shape,
				...t._zod.def.shape
			};
			return m(this, "shape", n), n;
		},
		get catchall() {
			return t._zod.def.catchall;
		},
		checks: t._zod.def.checks ?? []
	}));
}
function oe(e, t, n) {
	let r = t._zod.def.checks;
	if (r && r.length > 0) throw Error(".partial() cannot be used on object schemas containing refinements");
	return w(t, h(t._zod.def, {
		get shape() {
			let r = t._zod.def.shape, i = { ...r };
			if (n) for (let t in n) {
				if (!(t in r)) throw Error(`Unrecognized key: "${t}"`);
				n[t] && (i[t] = e ? new e({
					type: "optional",
					innerType: r[t]
				}) : r[t]);
			}
			else for (let t in r) i[t] = e ? new e({
				type: "optional",
				innerType: r[t]
			}) : r[t];
			return m(this, "shape", i), i;
		},
		checks: []
	}));
}
function se(e, t, n) {
	return w(t, h(t._zod.def, { get shape() {
		let r = t._zod.def.shape, i = { ...r };
		if (n) for (let t in n) {
			if (!(t in i)) throw Error(`Unrecognized key: "${t}"`);
			n[t] && (i[t] = new e({
				type: "nonoptional",
				innerType: r[t]
			}));
		}
		else for (let t in r) i[t] = new e({
			type: "nonoptional",
			innerType: r[t]
		});
		return m(this, "shape", i), i;
	} }));
}
function ce(e, t = 0) {
	if (e.aborted === !0) return !0;
	for (let n = t; n < e.issues.length; n++) if (e.issues[n]?.continue !== !0) return !0;
	return !1;
}
function le(e, t = 0) {
	if (e.aborted === !0) return !0;
	for (let n = t; n < e.issues.length; n++) if (e.issues[n]?.continue === !1) return !0;
	return !1;
}
function ue(e, t) {
	return t.map((t) => {
		var n;
		return (n = t).path ?? (n.path = []), t.path.unshift(e), t;
	});
}
function de(e) {
	return typeof e == "string" ? e : e?.message;
}
function fe(e, t, n) {
	let r = e.message ? e.message : de(e.inst?._zod.def?.error?.(e)) ?? de(t?.error?.(e)) ?? de(n.customError?.(e)) ?? de(n.localeError?.(e)) ?? "Invalid input", { inst: i, continue: a, input: o, ...s } = e;
	return s.path ??= [], s.message = r, t?.reportInput && (s.input = o), s;
}
function pe(e) {
	return Array.isArray(e) ? "array" : typeof e == "string" ? "string" : "unknown";
}
function me(...e) {
	let [t, n, r] = e;
	return typeof t == "string" ? {
		message: t,
		code: "custom",
		input: n,
		inst: r
	} : { ...t };
}
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/errors.js
var he = (e, t) => {
	e.name = "$ZodError", Object.defineProperty(e, "_zod", {
		value: e._zod,
		enumerable: !1
	}), Object.defineProperty(e, "issues", {
		value: t,
		enumerable: !1
	}), e.message = JSON.stringify(t, s, 2), Object.defineProperty(e, "toString", {
		value: () => e.message,
		enumerable: !1
	});
}, ge = t("$ZodError", he), O = t("$ZodError", he, { Parent: Error });
function _e(e, t = (e) => e.message) {
	let n = {}, r = [];
	for (let i of e.issues) i.path.length > 0 ? (n[i.path[0]] = n[i.path[0]] || [], n[i.path[0]].push(t(i))) : r.push(t(i));
	return {
		formErrors: r,
		fieldErrors: n
	};
}
function ve(e, t = (e) => e.message) {
	let n = { _errors: [] }, r = (e, i = []) => {
		for (let a of e.issues) if (a.code === "invalid_union" && a.errors.length) a.errors.map((e) => r({ issues: e }, [...i, ...a.path]));
		else if (a.code === "invalid_key") r({ issues: a.issues }, [...i, ...a.path]);
		else if (a.code === "invalid_element") r({ issues: a.issues }, [...i, ...a.path]);
		else {
			let e = [...i, ...a.path];
			if (e.length === 0) n._errors.push(t(a));
			else {
				let r = n, i = 0;
				for (; i < e.length;) {
					let n = e[i];
					i === e.length - 1 ? (r[n] = r[n] || { _errors: [] }, r[n]._errors.push(t(a))) : r[n] = r[n] || { _errors: [] }, r = r[n], i++;
				}
			}
		}
	};
	return r(e), n;
}
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/parse.js
var ye = (e) => (t, r, i, o) => {
	let s = i ? {
		...i,
		async: !1
	} : { async: !1 }, c = t._zod.run({
		value: r,
		issues: []
	}, s);
	if (c instanceof Promise) throw new n();
	if (c.issues.length) {
		let t = new ((o?.Err) ?? e)(c.issues.map((e) => fe(e, s, a())));
		throw v(t, o?.callee), t;
	}
	return c.value;
}, be = (e) => async (t, n, r, i) => {
	let o = r ? {
		...r,
		async: !0
	} : { async: !0 }, s = t._zod.run({
		value: n,
		issues: []
	}, o);
	if (s instanceof Promise && (s = await s), s.issues.length) {
		let t = new ((i?.Err) ?? e)(s.issues.map((e) => fe(e, o, a())));
		throw v(t, i?.callee), t;
	}
	return s.value;
}, xe = (e) => (t, r, i) => {
	let o = i ? {
		...i,
		async: !1
	} : { async: !1 }, s = t._zod.run({
		value: r,
		issues: []
	}, o);
	if (s instanceof Promise) throw new n();
	return s.issues.length ? {
		success: !1,
		error: new (e ?? ge)(s.issues.map((e) => fe(e, o, a())))
	} : {
		success: !0,
		data: s.value
	};
}, Se = /* @__PURE__*/ xe(O), k = (e) => async (t, n, r) => {
	let i = r ? {
		...r,
		async: !0
	} : { async: !0 }, o = t._zod.run({
		value: n,
		issues: []
	}, i);
	return o instanceof Promise && (o = await o), o.issues.length ? {
		success: !1,
		error: new e(o.issues.map((e) => fe(e, i, a())))
	} : {
		success: !0,
		data: o.value
	};
}, Ce = /* @__PURE__*/ k(O), we = (e) => (t, n, r) => {
	let i = r ? {
		...r,
		direction: "backward"
	} : { direction: "backward" };
	return ye(e)(t, n, i);
}, Te = (e) => (t, n, r) => ye(e)(t, n, r), Ee = (e) => async (t, n, r) => {
	let i = r ? {
		...r,
		direction: "backward"
	} : { direction: "backward" };
	return be(e)(t, n, i);
}, De = (e) => async (t, n, r) => be(e)(t, n, r), Oe = (e) => (t, n, r) => {
	let i = r ? {
		...r,
		direction: "backward"
	} : { direction: "backward" };
	return xe(e)(t, n, i);
}, ke = (e) => (t, n, r) => xe(e)(t, n, r), Ae = (e) => async (t, n, r) => {
	let i = r ? {
		...r,
		direction: "backward"
	} : { direction: "backward" };
	return k(e)(t, n, i);
}, je = (e) => async (t, n, r) => k(e)(t, n, r), Me = /^[cC][0-9a-z]{6,}$/, Ne = /^[0-9a-z]+$/, Pe = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/, Fe = /^[0-9a-vA-V]{20}$/, Ie = /^[A-Za-z0-9]{27}$/, Le = /^[a-zA-Z0-9_-]{21}$/, Re = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/, ze = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/, Be = (e) => e ? RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${e}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`) : /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/, Ve = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/, He = "^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$";
function Ue() {
	return new RegExp(He, "u");
}
var We = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/, Ge = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/, Ke = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/, qe = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/, Je = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/, Ye = /^[A-Za-z0-9_-]*$/, Xe = /^https?$/, Ze = /^\+[1-9]\d{6,14}$/, Qe = "(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))", $e = /*@__PURE__*/ RegExp(`^${Qe}$`);
function et(e) {
	let t = "(?:[01]\\d|2[0-3]):[0-5]\\d";
	return typeof e.precision == "number" ? e.precision === -1 ? `${t}` : e.precision === 0 ? `${t}:[0-5]\\d` : `${t}:[0-5]\\d\\.\\d{${e.precision}}` : `${t}(?::[0-5]\\d(?:\\.\\d+)?)?`;
}
function tt(e) {
	return RegExp(`^${et(e)}$`);
}
function nt(e) {
	let t = et({ precision: e.precision }), n = ["Z"];
	e.local && n.push(""), e.offset && n.push("([+-](?:[01]\\d|2[0-3]):[0-5]\\d)");
	let r = `${t}(?:${n.join("|")})`;
	return RegExp(`^${Qe}T(?:${r})$`);
}
var rt = (e) => {
	let t = e ? `[\\s\\S]{${e?.minimum ?? 0},${e?.maximum ?? ""}}` : "[\\s\\S]*";
	return RegExp(`^${t}$`);
}, it = /^-?\d+$/, at = /^-?\d+(?:\.\d+)?$/, ot = /^(?:true|false)$/i, st = /^[^A-Z]*$/, ct = /^[^a-z]*$/, A = /*@__PURE__*/ t("$ZodCheck", (e, t) => {
	var n;
	e._zod ??= {}, e._zod.def = t, (n = e._zod).onattach ?? (n.onattach = []);
}), lt = {
	number: "number",
	bigint: "bigint",
	object: "date"
}, ut = /*@__PURE__*/ t("$ZodCheckLessThan", (e, t) => {
	A.init(e, t);
	let n = lt[typeof t.value];
	e._zod.onattach.push((e) => {
		let n = e._zod.bag, r = (t.inclusive ? n.maximum : n.exclusiveMaximum) ?? Infinity;
		t.value < r && (t.inclusive ? n.maximum = t.value : n.exclusiveMaximum = t.value);
	}), e._zod.check = (r) => {
		(t.inclusive ? r.value <= t.value : r.value < t.value) || r.issues.push({
			origin: n,
			code: "too_big",
			maximum: typeof t.value == "object" ? t.value.getTime() : t.value,
			input: r.value,
			inclusive: t.inclusive,
			inst: e,
			continue: !t.abort
		});
	};
}), dt = /*@__PURE__*/ t("$ZodCheckGreaterThan", (e, t) => {
	A.init(e, t);
	let n = lt[typeof t.value];
	e._zod.onattach.push((e) => {
		let n = e._zod.bag, r = (t.inclusive ? n.minimum : n.exclusiveMinimum) ?? -Infinity;
		t.value > r && (t.inclusive ? n.minimum = t.value : n.exclusiveMinimum = t.value);
	}), e._zod.check = (r) => {
		(t.inclusive ? r.value >= t.value : r.value > t.value) || r.issues.push({
			origin: n,
			code: "too_small",
			minimum: typeof t.value == "object" ? t.value.getTime() : t.value,
			input: r.value,
			inclusive: t.inclusive,
			inst: e,
			continue: !t.abort
		});
	};
}), ft = /*@__PURE__*/ t("$ZodCheckMultipleOf", (e, t) => {
	A.init(e, t), e._zod.onattach.push((e) => {
		var n;
		(n = e._zod.bag).multipleOf ?? (n.multipleOf = t.value);
	}), e._zod.check = (n) => {
		if (typeof n.value != typeof t.value) throw Error("Cannot mix number and bigint in multiple_of check.");
		(typeof n.value == "bigint" ? n.value % t.value === BigInt(0) : d(n.value, t.value) === 0) || n.issues.push({
			origin: typeof n.value,
			code: "not_multiple_of",
			divisor: t.value,
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), pt = /*@__PURE__*/ t("$ZodCheckNumberFormat", (e, t) => {
	A.init(e, t), t.format = t.format || "float64";
	let n = t.format?.includes("int"), r = n ? "int" : "number", [i, a] = ne[t.format];
	e._zod.onattach.push((e) => {
		let r = e._zod.bag;
		r.format = t.format, r.minimum = i, r.maximum = a, n && (r.pattern = it);
	}), e._zod.check = (o) => {
		let s = o.value;
		if (n) {
			if (!Number.isInteger(s)) {
				o.issues.push({
					expected: r,
					format: t.format,
					code: "invalid_type",
					continue: !1,
					input: s,
					inst: e
				});
				return;
			}
			if (!Number.isSafeInteger(s)) {
				s > 0 ? o.issues.push({
					input: s,
					code: "too_big",
					maximum: 2 ** 53 - 1,
					note: "Integers must be within the safe integer range.",
					inst: e,
					origin: r,
					inclusive: !0,
					continue: !t.abort
				}) : o.issues.push({
					input: s,
					code: "too_small",
					minimum: -(2 ** 53 - 1),
					note: "Integers must be within the safe integer range.",
					inst: e,
					origin: r,
					inclusive: !0,
					continue: !t.abort
				});
				return;
			}
		}
		s < i && o.issues.push({
			origin: "number",
			input: s,
			code: "too_small",
			minimum: i,
			inclusive: !0,
			inst: e,
			continue: !t.abort
		}), s > a && o.issues.push({
			origin: "number",
			input: s,
			code: "too_big",
			maximum: a,
			inclusive: !0,
			inst: e,
			continue: !t.abort
		});
	};
}), mt = /*@__PURE__*/ t("$ZodCheckMaxLength", (e, t) => {
	var n;
	A.init(e, t), (n = e._zod.def).when ?? (n.when = (e) => {
		let t = e.value;
		return !l(t) && t.length !== void 0;
	}), e._zod.onattach.push((e) => {
		let n = e._zod.bag.maximum ?? Infinity;
		t.maximum < n && (e._zod.bag.maximum = t.maximum);
	}), e._zod.check = (n) => {
		let r = n.value;
		if (r.length <= t.maximum) return;
		let i = pe(r);
		n.issues.push({
			origin: i,
			code: "too_big",
			maximum: t.maximum,
			inclusive: !0,
			input: r,
			inst: e,
			continue: !t.abort
		});
	};
}), ht = /*@__PURE__*/ t("$ZodCheckMinLength", (e, t) => {
	var n;
	A.init(e, t), (n = e._zod.def).when ?? (n.when = (e) => {
		let t = e.value;
		return !l(t) && t.length !== void 0;
	}), e._zod.onattach.push((e) => {
		let n = e._zod.bag.minimum ?? -Infinity;
		t.minimum > n && (e._zod.bag.minimum = t.minimum);
	}), e._zod.check = (n) => {
		let r = n.value;
		if (r.length >= t.minimum) return;
		let i = pe(r);
		n.issues.push({
			origin: i,
			code: "too_small",
			minimum: t.minimum,
			inclusive: !0,
			input: r,
			inst: e,
			continue: !t.abort
		});
	};
}), gt = /*@__PURE__*/ t("$ZodCheckLengthEquals", (e, t) => {
	var n;
	A.init(e, t), (n = e._zod.def).when ?? (n.when = (e) => {
		let t = e.value;
		return !l(t) && t.length !== void 0;
	}), e._zod.onattach.push((e) => {
		let n = e._zod.bag;
		n.minimum = t.length, n.maximum = t.length, n.length = t.length;
	}), e._zod.check = (n) => {
		let r = n.value, i = r.length;
		if (i === t.length) return;
		let a = pe(r), o = i > t.length;
		n.issues.push({
			origin: a,
			...o ? {
				code: "too_big",
				maximum: t.length
			} : {
				code: "too_small",
				minimum: t.length
			},
			inclusive: !0,
			exact: !0,
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), _t = /*@__PURE__*/ t("$ZodCheckStringFormat", (e, t) => {
	var n, r;
	A.init(e, t), e._zod.onattach.push((e) => {
		let n = e._zod.bag;
		n.format = t.format, t.pattern && (n.patterns ??= /* @__PURE__ */ new Set(), n.patterns.add(t.pattern));
	}), t.pattern ? (n = e._zod).check ?? (n.check = (n) => {
		t.pattern.lastIndex = 0, !t.pattern.test(n.value) && n.issues.push({
			origin: "string",
			code: "invalid_format",
			format: t.format,
			input: n.value,
			...t.pattern ? { pattern: t.pattern.toString() } : {},
			inst: e,
			continue: !t.abort
		});
	}) : (r = e._zod).check ?? (r.check = () => {});
}), vt = /*@__PURE__*/ t("$ZodCheckRegex", (e, t) => {
	_t.init(e, t), e._zod.check = (n) => {
		t.pattern.lastIndex = 0, !t.pattern.test(n.value) && n.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "regex",
			input: n.value,
			pattern: t.pattern.toString(),
			inst: e,
			continue: !t.abort
		});
	};
}), yt = /*@__PURE__*/ t("$ZodCheckLowerCase", (e, t) => {
	t.pattern ??= st, _t.init(e, t);
}), bt = /*@__PURE__*/ t("$ZodCheckUpperCase", (e, t) => {
	t.pattern ??= ct, _t.init(e, t);
}), xt = /*@__PURE__*/ t("$ZodCheckIncludes", (e, t) => {
	A.init(e, t);
	let n = ee(t.includes), r = new RegExp(typeof t.position == "number" ? `^.{${t.position}}${n}` : n);
	t.pattern = r, e._zod.onattach.push((e) => {
		let t = e._zod.bag;
		t.patterns ??= /* @__PURE__ */ new Set(), t.patterns.add(r);
	}), e._zod.check = (n) => {
		n.value.includes(t.includes, t.position) || n.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "includes",
			includes: t.includes,
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), St = /*@__PURE__*/ t("$ZodCheckStartsWith", (e, t) => {
	A.init(e, t);
	let n = RegExp(`^${ee(t.prefix)}.*`);
	t.pattern ??= n, e._zod.onattach.push((e) => {
		let t = e._zod.bag;
		t.patterns ??= /* @__PURE__ */ new Set(), t.patterns.add(n);
	}), e._zod.check = (n) => {
		n.value.startsWith(t.prefix) || n.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "starts_with",
			prefix: t.prefix,
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), Ct = /*@__PURE__*/ t("$ZodCheckEndsWith", (e, t) => {
	A.init(e, t);
	let n = RegExp(`.*${ee(t.suffix)}$`);
	t.pattern ??= n, e._zod.onattach.push((e) => {
		let t = e._zod.bag;
		t.patterns ??= /* @__PURE__ */ new Set(), t.patterns.add(n);
	}), e._zod.check = (n) => {
		n.value.endsWith(t.suffix) || n.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "ends_with",
			suffix: t.suffix,
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), wt = /*@__PURE__*/ t("$ZodCheckOverwrite", (e, t) => {
	A.init(e, t), e._zod.check = (e) => {
		e.value = t.tx(e.value);
	};
}), Tt = class {
	constructor(e = []) {
		this.content = [], this.indent = 0, this && (this.args = e);
	}
	indented(e) {
		this.indent += 1, e(this), --this.indent;
	}
	write(e) {
		if (typeof e == "function") {
			e(this, { execution: "sync" }), e(this, { execution: "async" });
			return;
		}
		let t = e.split("\n").filter((e) => e), n = Math.min(...t.map((e) => e.length - e.trimStart().length)), r = t.map((e) => e.slice(n)).map((e) => " ".repeat(this.indent * 2) + e);
		for (let e of r) this.content.push(e);
	}
	compile() {
		let e = Function, t = this?.args, n = [...(this?.content ?? [""]).map((e) => `  ${e}`)];
		return new e(...t, n.join("\n"));
	}
}, Et = {
	major: 4,
	minor: 4,
	patch: 3
}, j = /*@__PURE__*/ t("$ZodType", (e, t) => {
	var r;
	e ??= {}, e._zod.def = t, e._zod.bag = e._zod.bag || {}, e._zod.version = Et;
	let i = [...e._zod.def.checks ?? []];
	e._zod.traits.has("$ZodCheck") && i.unshift(e);
	for (let t of i) for (let n of t._zod.onattach) n(e);
	if (i.length === 0) (r = e._zod).deferred ?? (r.deferred = []), e._zod.deferred?.push(() => {
		e._zod.run = e._zod.parse;
	});
	else {
		let t = (e, t, r) => {
			let i = ce(e), a;
			for (let o of t) {
				if (o._zod.def.when) {
					if (le(e) || !o._zod.def.when(e)) continue;
				} else if (i) continue;
				let t = e.issues.length, s = o._zod.check(e);
				if (s instanceof Promise && r?.async === !1) throw new n();
				if (a || s instanceof Promise) a = (a ?? Promise.resolve()).then(async () => {
					await s, e.issues.length !== t && (i ||= ce(e, t));
				});
				else {
					if (e.issues.length === t) continue;
					i ||= ce(e, t);
				}
			}
			return a ? a.then(() => e) : e;
		}, r = (r, a, o) => {
			if (ce(r)) return r.aborted = !0, r;
			let s = t(a, i, o);
			if (s instanceof Promise) {
				if (o.async === !1) throw new n();
				return s.then((t) => e._zod.parse(t, o));
			}
			return e._zod.parse(s, o);
		};
		e._zod.run = (a, o) => {
			if (o.skipChecks) return e._zod.parse(a, o);
			if (o.direction === "backward") {
				let t = e._zod.parse({
					value: a.value,
					issues: []
				}, {
					...o,
					skipChecks: !0
				});
				return t instanceof Promise ? t.then((e) => r(e, a, o)) : r(t, a, o);
			}
			let s = e._zod.parse(a, o);
			if (s instanceof Promise) {
				if (o.async === !1) throw new n();
				return s.then((e) => t(e, i, o));
			}
			return t(s, i, o);
		};
	}
	p(e, "~standard", () => ({
		validate: (t) => {
			try {
				let n = Se(e, t);
				return n.success ? { value: n.data } : { issues: n.error?.issues };
			} catch {
				return Ce(e, t).then((e) => e.success ? { value: e.data } : { issues: e.error?.issues });
			}
		},
		vendor: "zod",
		version: 1
	}));
}), Dt = /*@__PURE__*/ t("$ZodString", (e, t) => {
	j.init(e, t), e._zod.pattern = [...e?._zod.bag?.patterns ?? []].pop() ?? rt(e._zod.bag), e._zod.parse = (n, r) => {
		if (t.coerce) try {
			n.value = String(n.value);
		} catch {}
		return typeof n.value == "string" || n.issues.push({
			expected: "string",
			code: "invalid_type",
			input: n.value,
			inst: e
		}), n;
	};
}), M = /*@__PURE__*/ t("$ZodStringFormat", (e, t) => {
	_t.init(e, t), Dt.init(e, t);
}), Ot = /*@__PURE__*/ t("$ZodGUID", (e, t) => {
	t.pattern ??= ze, M.init(e, t);
}), kt = /*@__PURE__*/ t("$ZodUUID", (e, t) => {
	if (t.version) {
		let e = {
			v1: 1,
			v2: 2,
			v3: 3,
			v4: 4,
			v5: 5,
			v6: 6,
			v7: 7,
			v8: 8
		}[t.version];
		if (e === void 0) throw Error(`Invalid UUID version: "${t.version}"`);
		t.pattern ??= Be(e);
	} else t.pattern ??= Be();
	M.init(e, t);
}), At = /*@__PURE__*/ t("$ZodEmail", (e, t) => {
	t.pattern ??= Ve, M.init(e, t);
}), jt = /*@__PURE__*/ t("$ZodURL", (e, t) => {
	M.init(e, t), e._zod.check = (n) => {
		try {
			let r = n.value.trim();
			if (!t.normalize && t.protocol?.source === Xe.source && !/^https?:\/\//i.test(r)) {
				n.issues.push({
					code: "invalid_format",
					format: "url",
					note: "Invalid URL format",
					input: n.value,
					inst: e,
					continue: !t.abort
				});
				return;
			}
			let i = new URL(r);
			t.hostname && (t.hostname.lastIndex = 0, t.hostname.test(i.hostname) || n.issues.push({
				code: "invalid_format",
				format: "url",
				note: "Invalid hostname",
				pattern: t.hostname.source,
				input: n.value,
				inst: e,
				continue: !t.abort
			})), t.protocol && (t.protocol.lastIndex = 0, t.protocol.test(i.protocol.endsWith(":") ? i.protocol.slice(0, -1) : i.protocol) || n.issues.push({
				code: "invalid_format",
				format: "url",
				note: "Invalid protocol",
				pattern: t.protocol.source,
				input: n.value,
				inst: e,
				continue: !t.abort
			})), t.normalize ? n.value = i.href : n.value = r;
			return;
		} catch {
			n.issues.push({
				code: "invalid_format",
				format: "url",
				input: n.value,
				inst: e,
				continue: !t.abort
			});
		}
	};
}), Mt = /*@__PURE__*/ t("$ZodEmoji", (e, t) => {
	t.pattern ??= Ue(), M.init(e, t);
}), Nt = /*@__PURE__*/ t("$ZodNanoID", (e, t) => {
	t.pattern ??= Le, M.init(e, t);
}), Pt = /*@__PURE__*/ t("$ZodCUID", (e, t) => {
	t.pattern ??= Me, M.init(e, t);
}), Ft = /*@__PURE__*/ t("$ZodCUID2", (e, t) => {
	t.pattern ??= Ne, M.init(e, t);
}), It = /*@__PURE__*/ t("$ZodULID", (e, t) => {
	t.pattern ??= Pe, M.init(e, t);
}), Lt = /*@__PURE__*/ t("$ZodXID", (e, t) => {
	t.pattern ??= Fe, M.init(e, t);
}), Rt = /*@__PURE__*/ t("$ZodKSUID", (e, t) => {
	t.pattern ??= Ie, M.init(e, t);
}), zt = /*@__PURE__*/ t("$ZodISODateTime", (e, t) => {
	t.pattern ??= nt(t), M.init(e, t);
}), Bt = /*@__PURE__*/ t("$ZodISODate", (e, t) => {
	t.pattern ??= $e, M.init(e, t);
}), Vt = /*@__PURE__*/ t("$ZodISOTime", (e, t) => {
	t.pattern ??= tt(t), M.init(e, t);
}), Ht = /*@__PURE__*/ t("$ZodISODuration", (e, t) => {
	t.pattern ??= Re, M.init(e, t);
}), Ut = /*@__PURE__*/ t("$ZodIPv4", (e, t) => {
	t.pattern ??= We, M.init(e, t), e._zod.bag.format = "ipv4";
}), Wt = /*@__PURE__*/ t("$ZodIPv6", (e, t) => {
	t.pattern ??= Ge, M.init(e, t), e._zod.bag.format = "ipv6", e._zod.check = (n) => {
		try {
			new URL(`http://[${n.value}]`);
		} catch {
			n.issues.push({
				code: "invalid_format",
				format: "ipv6",
				input: n.value,
				inst: e,
				continue: !t.abort
			});
		}
	};
}), Gt = /*@__PURE__*/ t("$ZodCIDRv4", (e, t) => {
	t.pattern ??= Ke, M.init(e, t);
}), Kt = /*@__PURE__*/ t("$ZodCIDRv6", (e, t) => {
	t.pattern ??= qe, M.init(e, t), e._zod.check = (n) => {
		let r = n.value.split("/");
		try {
			if (r.length !== 2) throw Error();
			let [e, t] = r;
			if (!t) throw Error();
			let n = Number(t);
			if (`${n}` !== t || n < 0 || n > 128) throw Error();
			new URL(`http://[${e}]`);
		} catch {
			n.issues.push({
				code: "invalid_format",
				format: "cidrv6",
				input: n.value,
				inst: e,
				continue: !t.abort
			});
		}
	};
});
function qt(e) {
	if (e === "") return !0;
	if (/\s/.test(e) || e.length % 4 != 0) return !1;
	try {
		return atob(e), !0;
	} catch {
		return !1;
	}
}
var Jt = /*@__PURE__*/ t("$ZodBase64", (e, t) => {
	t.pattern ??= Je, M.init(e, t), e._zod.bag.contentEncoding = "base64", e._zod.check = (n) => {
		qt(n.value) || n.issues.push({
			code: "invalid_format",
			format: "base64",
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
});
function Yt(e) {
	if (!Ye.test(e)) return !1;
	let t = e.replace(/[-_]/g, (e) => e === "-" ? "+" : "/");
	return qt(t.padEnd(Math.ceil(t.length / 4) * 4, "="));
}
var Xt = /*@__PURE__*/ t("$ZodBase64URL", (e, t) => {
	t.pattern ??= Ye, M.init(e, t), e._zod.bag.contentEncoding = "base64url", e._zod.check = (n) => {
		Yt(n.value) || n.issues.push({
			code: "invalid_format",
			format: "base64url",
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), Zt = /*@__PURE__*/ t("$ZodE164", (e, t) => {
	t.pattern ??= Ze, M.init(e, t);
});
function Qt(e, t = null) {
	try {
		let n = e.split(".");
		if (n.length !== 3) return !1;
		let [r] = n;
		if (!r) return !1;
		let i = JSON.parse(atob(r));
		return !("typ" in i && i?.typ !== "JWT" || !i.alg || t && (!("alg" in i) || i.alg !== t));
	} catch {
		return !1;
	}
}
var $t = /*@__PURE__*/ t("$ZodJWT", (e, t) => {
	M.init(e, t), e._zod.check = (n) => {
		Qt(n.value, t.alg) || n.issues.push({
			code: "invalid_format",
			format: "jwt",
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), en = /*@__PURE__*/ t("$ZodNumber", (e, t) => {
	j.init(e, t), e._zod.pattern = e._zod.bag.pattern ?? at, e._zod.parse = (n, r) => {
		if (t.coerce) try {
			n.value = Number(n.value);
		} catch {}
		let i = n.value;
		if (typeof i == "number" && !Number.isNaN(i) && Number.isFinite(i)) return n;
		let a = typeof i == "number" ? Number.isNaN(i) ? "NaN" : Number.isFinite(i) ? void 0 : "Infinity" : void 0;
		return n.issues.push({
			expected: "number",
			code: "invalid_type",
			input: i,
			inst: e,
			...a ? { received: a } : {}
		}), n;
	};
}), tn = /*@__PURE__*/ t("$ZodNumberFormat", (e, t) => {
	pt.init(e, t), en.init(e, t);
}), nn = /*@__PURE__*/ t("$ZodBoolean", (e, t) => {
	j.init(e, t), e._zod.pattern = ot, e._zod.parse = (n, r) => {
		if (t.coerce) try {
			n.value = !!n.value;
		} catch {}
		let i = n.value;
		return typeof i == "boolean" || n.issues.push({
			expected: "boolean",
			code: "invalid_type",
			input: i,
			inst: e
		}), n;
	};
}), rn = /*@__PURE__*/ t("$ZodUnknown", (e, t) => {
	j.init(e, t), e._zod.parse = (e) => e;
}), an = /*@__PURE__*/ t("$ZodNever", (e, t) => {
	j.init(e, t), e._zod.parse = (t, n) => (t.issues.push({
		expected: "never",
		code: "invalid_type",
		input: t.value,
		inst: e
	}), t);
});
function on(e, t, n) {
	e.issues.length && t.issues.push(...ue(n, e.issues)), t.value[n] = e.value;
}
var sn = /*@__PURE__*/ t("$ZodArray", (e, t) => {
	j.init(e, t), e._zod.parse = (n, r) => {
		let i = n.value;
		if (!Array.isArray(i)) return n.issues.push({
			expected: "array",
			code: "invalid_type",
			input: i,
			inst: e
		}), n;
		n.value = Array(i.length);
		let a = [];
		for (let e = 0; e < i.length; e++) {
			let o = i[e], s = t.element._zod.run({
				value: o,
				issues: []
			}, r);
			s instanceof Promise ? a.push(s.then((t) => on(t, n, e))) : on(s, n, e);
		}
		return a.length ? Promise.all(a).then(() => n) : n;
	};
});
function cn(e, t, n, r, i, a) {
	let o = n in r;
	if (e.issues.length) {
		if (i && a && !o) return;
		t.issues.push(...ue(n, e.issues));
	}
	if (!o && !i) {
		e.issues.length || t.issues.push({
			code: "invalid_type",
			expected: "nonoptional",
			input: void 0,
			path: [n]
		});
		return;
	}
	e.value === void 0 ? o && (t.value[n] = void 0) : t.value[n] = e.value;
}
function ln(e) {
	let t = Object.keys(e.shape);
	for (let n of t) if (!e.shape?.[n]?._zod?.traits?.has("$ZodType")) throw Error(`Invalid element at key "${n}": expected a Zod schema`);
	let n = te(e.shape);
	return {
		...e,
		keys: t,
		keySet: new Set(t),
		numKeys: t.length,
		optionalKeys: new Set(n)
	};
}
function un(e, t, n, r, i, a) {
	let o = [], s = i.keySet, c = i.catchall._zod, l = c.def.type, u = c.optin === "optional", d = c.optout === "optional";
	for (let i in t) {
		if (i === "__proto__" || s.has(i)) continue;
		if (l === "never") {
			o.push(i);
			continue;
		}
		let a = c.run({
			value: t[i],
			issues: []
		}, r);
		a instanceof Promise ? e.push(a.then((e) => cn(e, n, i, t, u, d))) : cn(a, n, i, t, u, d);
	}
	return o.length && n.issues.push({
		code: "unrecognized_keys",
		keys: o,
		input: t,
		inst: a
	}), e.length ? Promise.all(e).then(() => n) : n;
}
var dn = /*@__PURE__*/ t("$ZodObject", (e, t) => {
	if (j.init(e, t), !Object.getOwnPropertyDescriptor(t, "shape")?.get) {
		let e = t.shape;
		Object.defineProperty(t, "shape", { get: () => {
			let n = { ...e };
			return Object.defineProperty(t, "shape", { value: n }), n;
		} });
	}
	let n = c(() => ln(t));
	p(e._zod, "propValues", () => {
		let e = t.shape, n = {};
		for (let t in e) {
			let r = e[t]._zod;
			if (r.values) {
				n[t] ?? (n[t] = /* @__PURE__ */ new Set());
				for (let e of r.values) n[t].add(e);
			}
		}
		return n;
	});
	let r = y, i = t.catchall, a;
	e._zod.parse = (t, o) => {
		a ??= n.value;
		let s = t.value;
		if (!r(s)) return t.issues.push({
			expected: "object",
			code: "invalid_type",
			input: s,
			inst: e
		}), t;
		t.value = {};
		let c = [], l = a.shape;
		for (let e of a.keys) {
			let n = l[e], r = n._zod.optin === "optional", i = n._zod.optout === "optional", a = n._zod.run({
				value: s[e],
				issues: []
			}, o);
			a instanceof Promise ? c.push(a.then((n) => cn(n, t, e, s, r, i))) : cn(a, t, e, s, r, i);
		}
		return i ? un(c, s, t, o, n.value, e) : c.length ? Promise.all(c).then(() => t) : t;
	};
}), fn = /*@__PURE__*/ t("$ZodObjectJIT", (e, t) => {
	dn.init(e, t);
	let n = e._zod.parse, r = c(() => ln(t)), a = (e) => {
		let t = new Tt([
			"shape",
			"payload",
			"ctx"
		]), n = r.value, i = (e) => {
			let t = g(e);
			return `shape[${t}]._zod.run({ value: input[${t}], issues: [] }, ctx)`;
		};
		t.write("const input = payload.value;");
		let a = Object.create(null), o = 0;
		for (let e of n.keys) a[e] = `key_${o++}`;
		t.write("const newResult = {};");
		for (let r of n.keys) {
			let n = a[r], o = g(r), s = e[r], c = s?._zod?.optin === "optional", l = s?._zod?.optout === "optional";
			t.write(`const ${n} = ${i(r)};`), c && l ? t.write(`
        if (${n}.issues.length) {
          if (${o} in input) {
            payload.issues = payload.issues.concat(${n}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${o}, ...iss.path] : [${o}]
            })));
          }
        }
        
        if (${n}.value === undefined) {
          if (${o} in input) {
            newResult[${o}] = undefined;
          }
        } else {
          newResult[${o}] = ${n}.value;
        }
        
      `) : c ? t.write(`
        if (${n}.issues.length) {
          payload.issues = payload.issues.concat(${n}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${o}, ...iss.path] : [${o}]
          })));
        }
        
        if (${n}.value === undefined) {
          if (${o} in input) {
            newResult[${o}] = undefined;
          }
        } else {
          newResult[${o}] = ${n}.value;
        }
        
      `) : t.write(`
        const ${n}_present = ${o} in input;
        if (${n}.issues.length) {
          payload.issues = payload.issues.concat(${n}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${o}, ...iss.path] : [${o}]
          })));
        }
        if (!${n}_present && !${n}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${o}]
          });
        }

        if (${n}_present) {
          if (${n}.value === undefined) {
            newResult[${o}] = undefined;
          } else {
            newResult[${o}] = ${n}.value;
          }
        }

      `);
		}
		t.write("payload.value = newResult;"), t.write("return payload;");
		let s = t.compile();
		return (t, n) => s(e, t, n);
	}, o, s = y, l = !i.jitless, u = l && b.value, d = t.catchall, f;
	e._zod.parse = (i, c) => {
		f ??= r.value;
		let p = i.value;
		return s(p) ? l && u && c?.async === !1 && c.jitless !== !0 ? (o ||= a(t.shape), i = o(i, c), d ? un([], p, i, c, f, e) : i) : n(i, c) : (i.issues.push({
			expected: "object",
			code: "invalid_type",
			input: p,
			inst: e
		}), i);
	};
});
function pn(e, t, n, r) {
	for (let n of e) if (n.issues.length === 0) return t.value = n.value, t;
	let i = e.filter((e) => !ce(e));
	return i.length === 1 ? (t.value = i[0].value, i[0]) : (t.issues.push({
		code: "invalid_union",
		input: t.value,
		inst: n,
		errors: e.map((e) => e.issues.map((e) => fe(e, r, a())))
	}), t);
}
var mn = /*@__PURE__*/ t("$ZodUnion", (e, t) => {
	j.init(e, t), p(e._zod, "optin", () => t.options.some((e) => e._zod.optin === "optional") ? "optional" : void 0), p(e._zod, "optout", () => t.options.some((e) => e._zod.optout === "optional") ? "optional" : void 0), p(e._zod, "values", () => {
		if (t.options.every((e) => e._zod.values)) return new Set(t.options.flatMap((e) => Array.from(e._zod.values)));
	}), p(e._zod, "pattern", () => {
		if (t.options.every((e) => e._zod.pattern)) {
			let e = t.options.map((e) => e._zod.pattern);
			return RegExp(`^(${e.map((e) => u(e.source)).join("|")})$`);
		}
	});
	let n = t.options.length === 1 ? t.options[0]._zod.run : null;
	e._zod.parse = (r, i) => {
		if (n) return n(r, i);
		let a = !1, o = [];
		for (let e of t.options) {
			let t = e._zod.run({
				value: r.value,
				issues: []
			}, i);
			if (t instanceof Promise) o.push(t), a = !0;
			else {
				if (t.issues.length === 0) return t;
				o.push(t);
			}
		}
		return a ? Promise.all(o).then((t) => pn(t, r, e, i)) : pn(o, r, e, i);
	};
}), hn = /*@__PURE__*/ t("$ZodDiscriminatedUnion", (e, t) => {
	t.inclusive = !1, mn.init(e, t);
	let n = e._zod.parse;
	p(e._zod, "propValues", () => {
		let e = {};
		for (let n of t.options) {
			let r = n._zod.propValues;
			if (!r || Object.keys(r).length === 0) throw Error(`Invalid discriminated union option at index "${t.options.indexOf(n)}"`);
			for (let [t, n] of Object.entries(r)) {
				e[t] || (e[t] = /* @__PURE__ */ new Set());
				for (let r of n) e[t].add(r);
			}
		}
		return e;
	});
	let r = c(() => {
		let e = t.options, n = /* @__PURE__ */ new Map();
		for (let r of e) {
			let e = r._zod.propValues?.[t.discriminator];
			if (!e || e.size === 0) throw Error(`Invalid discriminated union option at index "${t.options.indexOf(r)}"`);
			for (let t of e) {
				if (n.has(t)) throw Error(`Duplicate discriminator value "${String(t)}"`);
				n.set(t, r);
			}
		}
		return n;
	});
	e._zod.parse = (i, a) => {
		let o = i.value;
		if (!y(o)) return i.issues.push({
			code: "invalid_type",
			expected: "object",
			input: o,
			inst: e
		}), i;
		let s = r.value.get(o?.[t.discriminator]);
		return s ? s._zod.run(i, a) : t.unionFallback || a.direction === "backward" ? n(i, a) : (i.issues.push({
			code: "invalid_union",
			errors: [],
			note: "No matching discriminator",
			discriminator: t.discriminator,
			options: Array.from(r.value.keys()),
			input: o,
			path: [t.discriminator],
			inst: e
		}), i);
	};
}), gn = /*@__PURE__*/ t("$ZodIntersection", (e, t) => {
	j.init(e, t), e._zod.parse = (e, n) => {
		let r = e.value, i = t.left._zod.run({
			value: r,
			issues: []
		}, n), a = t.right._zod.run({
			value: r,
			issues: []
		}, n);
		return i instanceof Promise || a instanceof Promise ? Promise.all([i, a]).then(([t, n]) => vn(e, t, n)) : vn(e, i, a);
	};
});
function _n(e, t) {
	if (e === t || e instanceof Date && t instanceof Date && +e == +t) return {
		valid: !0,
		data: e
	};
	if (x(e) && x(t)) {
		let n = Object.keys(t), r = Object.keys(e).filter((e) => n.indexOf(e) !== -1), i = {
			...e,
			...t
		};
		for (let n of r) {
			let r = _n(e[n], t[n]);
			if (!r.valid) return {
				valid: !1,
				mergeErrorPath: [n, ...r.mergeErrorPath]
			};
			i[n] = r.data;
		}
		return {
			valid: !0,
			data: i
		};
	}
	if (Array.isArray(e) && Array.isArray(t)) {
		if (e.length !== t.length) return {
			valid: !1,
			mergeErrorPath: []
		};
		let n = [];
		for (let r = 0; r < e.length; r++) {
			let i = e[r], a = t[r], o = _n(i, a);
			if (!o.valid) return {
				valid: !1,
				mergeErrorPath: [r, ...o.mergeErrorPath]
			};
			n.push(o.data);
		}
		return {
			valid: !0,
			data: n
		};
	}
	return {
		valid: !1,
		mergeErrorPath: []
	};
}
function vn(e, t, n) {
	let r = /* @__PURE__ */ new Map(), i;
	for (let n of t.issues) if (n.code === "unrecognized_keys") {
		i ??= n;
		for (let e of n.keys) r.has(e) || r.set(e, {}), r.get(e).l = !0;
	} else e.issues.push(n);
	for (let t of n.issues) if (t.code === "unrecognized_keys") for (let e of t.keys) r.has(e) || r.set(e, {}), r.get(e).r = !0;
	else e.issues.push(t);
	let a = [...r].filter(([, e]) => e.l && e.r).map(([e]) => e);
	if (a.length && i && e.issues.push({
		...i,
		keys: a
	}), ce(e)) return e;
	let o = _n(t.value, n.value);
	if (!o.valid) throw Error(`Unmergable intersection. Error path: ${JSON.stringify(o.mergeErrorPath)}`);
	return e.value = o.data, e;
}
var yn = /*@__PURE__*/ t("$ZodRecord", (e, t) => {
	j.init(e, t), e._zod.parse = (n, r) => {
		let i = n.value;
		if (!x(i)) return n.issues.push({
			expected: "record",
			code: "invalid_type",
			input: i,
			inst: e
		}), n;
		let o = [], s = t.keyType._zod.values;
		if (s) {
			n.value = {};
			let c = /* @__PURE__ */ new Set();
			for (let l of s) if (typeof l == "string" || typeof l == "number" || typeof l == "symbol") {
				c.add(typeof l == "number" ? l.toString() : l);
				let s = t.keyType._zod.run({
					value: l,
					issues: []
				}, r);
				if (s instanceof Promise) throw Error("Async schemas not supported in object keys currently");
				if (s.issues.length) {
					n.issues.push({
						code: "invalid_key",
						origin: "record",
						issues: s.issues.map((e) => fe(e, r, a())),
						input: l,
						path: [l],
						inst: e
					});
					continue;
				}
				let u = s.value, d = t.valueType._zod.run({
					value: i[l],
					issues: []
				}, r);
				d instanceof Promise ? o.push(d.then((e) => {
					e.issues.length && n.issues.push(...ue(l, e.issues)), n.value[u] = e.value;
				})) : (d.issues.length && n.issues.push(...ue(l, d.issues)), n.value[u] = d.value);
			}
			let l;
			for (let e in i) c.has(e) || (l ??= [], l.push(e));
			l && l.length > 0 && n.issues.push({
				code: "unrecognized_keys",
				input: i,
				inst: e,
				keys: l
			});
		} else {
			n.value = {};
			for (let s of Reflect.ownKeys(i)) {
				if (s === "__proto__" || !Object.prototype.propertyIsEnumerable.call(i, s)) continue;
				let c = t.keyType._zod.run({
					value: s,
					issues: []
				}, r);
				if (c instanceof Promise) throw Error("Async schemas not supported in object keys currently");
				if (typeof s == "string" && at.test(s) && c.issues.length) {
					let e = t.keyType._zod.run({
						value: Number(s),
						issues: []
					}, r);
					if (e instanceof Promise) throw Error("Async schemas not supported in object keys currently");
					e.issues.length === 0 && (c = e);
				}
				if (c.issues.length) {
					t.mode === "loose" ? n.value[s] = i[s] : n.issues.push({
						code: "invalid_key",
						origin: "record",
						issues: c.issues.map((e) => fe(e, r, a())),
						input: s,
						path: [s],
						inst: e
					});
					continue;
				}
				let l = t.valueType._zod.run({
					value: i[s],
					issues: []
				}, r);
				l instanceof Promise ? o.push(l.then((e) => {
					e.issues.length && n.issues.push(...ue(s, e.issues)), n.value[c.value] = e.value;
				})) : (l.issues.length && n.issues.push(...ue(s, l.issues)), n.value[c.value] = l.value);
			}
		}
		return o.length ? Promise.all(o).then(() => n) : n;
	};
}), bn = /*@__PURE__*/ t("$ZodEnum", (e, t) => {
	j.init(e, t);
	let n = o(t.entries), r = new Set(n);
	e._zod.values = r, e._zod.pattern = RegExp(`^(${n.filter((e) => C.has(typeof e)).map((e) => typeof e == "string" ? ee(e) : e.toString()).join("|")})$`), e._zod.parse = (t, i) => {
		let a = t.value;
		return r.has(a) || t.issues.push({
			code: "invalid_value",
			values: n,
			input: a,
			inst: e
		}), t;
	};
}), xn = /*@__PURE__*/ t("$ZodLiteral", (e, t) => {
	if (j.init(e, t), t.values.length === 0) throw Error("Cannot create literal schema with no valid values");
	let n = new Set(t.values);
	e._zod.values = n, e._zod.pattern = RegExp(`^(${t.values.map((e) => typeof e == "string" ? ee(e) : e ? ee(e.toString()) : String(e)).join("|")})$`), e._zod.parse = (r, i) => {
		let a = r.value;
		return n.has(a) || r.issues.push({
			code: "invalid_value",
			values: t.values,
			input: a,
			inst: e
		}), r;
	};
}), Sn = /*@__PURE__*/ t("$ZodTransform", (e, t) => {
	j.init(e, t), e._zod.optin = "optional", e._zod.parse = (i, a) => {
		if (a.direction === "backward") throw new r(e.constructor.name);
		let o = t.transform(i.value, i);
		if (a.async) return (o instanceof Promise ? o : Promise.resolve(o)).then((e) => (i.value = e, i.fallback = !0, i));
		if (o instanceof Promise) throw new n();
		return i.value = o, i.fallback = !0, i;
	};
});
function Cn(e, t) {
	return t === void 0 && (e.issues.length || e.fallback) ? {
		issues: [],
		value: void 0
	} : e;
}
var wn = /*@__PURE__*/ t("$ZodOptional", (e, t) => {
	j.init(e, t), e._zod.optin = "optional", e._zod.optout = "optional", p(e._zod, "values", () => t.innerType._zod.values ? /* @__PURE__ */ new Set([...t.innerType._zod.values, void 0]) : void 0), p(e._zod, "pattern", () => {
		let e = t.innerType._zod.pattern;
		return e ? RegExp(`^(${u(e.source)})?$`) : void 0;
	}), e._zod.parse = (e, n) => {
		if (t.innerType._zod.optin === "optional") {
			let r = e.value, i = t.innerType._zod.run(e, n);
			return i instanceof Promise ? i.then((e) => Cn(e, r)) : Cn(i, r);
		}
		return e.value === void 0 ? e : t.innerType._zod.run(e, n);
	};
}), Tn = /*@__PURE__*/ t("$ZodExactOptional", (e, t) => {
	wn.init(e, t), p(e._zod, "values", () => t.innerType._zod.values), p(e._zod, "pattern", () => t.innerType._zod.pattern), e._zod.parse = (e, n) => t.innerType._zod.run(e, n);
}), En = /*@__PURE__*/ t("$ZodNullable", (e, t) => {
	j.init(e, t), p(e._zod, "optin", () => t.innerType._zod.optin), p(e._zod, "optout", () => t.innerType._zod.optout), p(e._zod, "pattern", () => {
		let e = t.innerType._zod.pattern;
		return e ? RegExp(`^(${u(e.source)}|null)$`) : void 0;
	}), p(e._zod, "values", () => t.innerType._zod.values ? /* @__PURE__ */ new Set([...t.innerType._zod.values, null]) : void 0), e._zod.parse = (e, n) => e.value === null ? e : t.innerType._zod.run(e, n);
}), Dn = /*@__PURE__*/ t("$ZodDefault", (e, t) => {
	j.init(e, t), e._zod.optin = "optional", p(e._zod, "values", () => t.innerType._zod.values), e._zod.parse = (e, n) => {
		if (n.direction === "backward") return t.innerType._zod.run(e, n);
		if (e.value === void 0) return e.value = t.defaultValue, e;
		let r = t.innerType._zod.run(e, n);
		return r instanceof Promise ? r.then((e) => On(e, t)) : On(r, t);
	};
});
function On(e, t) {
	return e.value === void 0 && (e.value = t.defaultValue), e;
}
var kn = /*@__PURE__*/ t("$ZodPrefault", (e, t) => {
	j.init(e, t), e._zod.optin = "optional", p(e._zod, "values", () => t.innerType._zod.values), e._zod.parse = (e, n) => (n.direction === "backward" || e.value === void 0 && (e.value = t.defaultValue), t.innerType._zod.run(e, n));
}), An = /*@__PURE__*/ t("$ZodNonOptional", (e, t) => {
	j.init(e, t), p(e._zod, "values", () => {
		let e = t.innerType._zod.values;
		return e ? new Set([...e].filter((e) => e !== void 0)) : void 0;
	}), e._zod.parse = (n, r) => {
		let i = t.innerType._zod.run(n, r);
		return i instanceof Promise ? i.then((t) => jn(t, e)) : jn(i, e);
	};
});
function jn(e, t) {
	return !e.issues.length && e.value === void 0 && e.issues.push({
		code: "invalid_type",
		expected: "nonoptional",
		input: e.value,
		inst: t
	}), e;
}
var Mn = /*@__PURE__*/ t("$ZodCatch", (e, t) => {
	j.init(e, t), e._zod.optin = "optional", p(e._zod, "optout", () => t.innerType._zod.optout), p(e._zod, "values", () => t.innerType._zod.values), e._zod.parse = (e, n) => {
		if (n.direction === "backward") return t.innerType._zod.run(e, n);
		let r = t.innerType._zod.run(e, n);
		return r instanceof Promise ? r.then((r) => (e.value = r.value, r.issues.length && (e.value = t.catchValue({
			...e,
			error: { issues: r.issues.map((e) => fe(e, n, a())) },
			input: e.value
		}), e.issues = [], e.fallback = !0), e)) : (e.value = r.value, r.issues.length && (e.value = t.catchValue({
			...e,
			error: { issues: r.issues.map((e) => fe(e, n, a())) },
			input: e.value
		}), e.issues = [], e.fallback = !0), e);
	};
}), Nn = /*@__PURE__*/ t("$ZodPipe", (e, t) => {
	j.init(e, t), p(e._zod, "values", () => t.in._zod.values), p(e._zod, "optin", () => t.in._zod.optin), p(e._zod, "optout", () => t.out._zod.optout), p(e._zod, "propValues", () => t.in._zod.propValues), e._zod.parse = (e, n) => {
		if (n.direction === "backward") {
			let r = t.out._zod.run(e, n);
			return r instanceof Promise ? r.then((e) => Pn(e, t.in, n)) : Pn(r, t.in, n);
		}
		let r = t.in._zod.run(e, n);
		return r instanceof Promise ? r.then((e) => Pn(e, t.out, n)) : Pn(r, t.out, n);
	};
});
function Pn(e, t, n) {
	return e.issues.length ? (e.aborted = !0, e) : t._zod.run({
		value: e.value,
		issues: e.issues,
		fallback: e.fallback
	}, n);
}
var Fn = /*@__PURE__*/ t("$ZodReadonly", (e, t) => {
	j.init(e, t), p(e._zod, "propValues", () => t.innerType._zod.propValues), p(e._zod, "values", () => t.innerType._zod.values), p(e._zod, "optin", () => t.innerType?._zod?.optin), p(e._zod, "optout", () => t.innerType?._zod?.optout), e._zod.parse = (e, n) => {
		if (n.direction === "backward") return t.innerType._zod.run(e, n);
		let r = t.innerType._zod.run(e, n);
		return r instanceof Promise ? r.then(In) : In(r);
	};
});
function In(e) {
	return e.value = Object.freeze(e.value), e;
}
var Ln = /*@__PURE__*/ t("$ZodCustom", (e, t) => {
	A.init(e, t), j.init(e, t), e._zod.parse = (e, t) => e, e._zod.check = (n) => {
		let r = n.value, i = t.fn(r);
		if (i instanceof Promise) return i.then((t) => Rn(t, n, r, e));
		Rn(i, n, r, e);
	};
});
function Rn(e, t, n, r) {
	if (!e) {
		let e = {
			code: "custom",
			input: n,
			inst: r,
			path: [...r._zod.def.path ?? []],
			continue: !r._zod.def.abort
		};
		r._zod.def.params && (e.params = r._zod.def.params), t.issues.push(me(e));
	}
}
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/registries.js
var zn, Bn = class {
	constructor() {
		this._map = /* @__PURE__ */ new WeakMap(), this._idmap = /* @__PURE__ */ new Map();
	}
	add(e, ...t) {
		let n = t[0];
		return this._map.set(e, n), n && typeof n == "object" && "id" in n && this._idmap.set(n.id, e), this;
	}
	clear() {
		return this._map = /* @__PURE__ */ new WeakMap(), this._idmap = /* @__PURE__ */ new Map(), this;
	}
	remove(e) {
		let t = this._map.get(e);
		return t && typeof t == "object" && "id" in t && this._idmap.delete(t.id), this._map.delete(e), this;
	}
	get(e) {
		let t = e._zod.parent;
		if (t) {
			let n = { ...this.get(t) ?? {} };
			delete n.id;
			let r = {
				...n,
				...this._map.get(e)
			};
			return Object.keys(r).length ? r : void 0;
		}
		return this._map.get(e);
	}
	has(e) {
		return this._map.has(e);
	}
};
function Vn() {
	return new Bn();
}
(zn = globalThis).__zod_globalRegistry ?? (zn.__zod_globalRegistry = Vn());
var Hn = globalThis.__zod_globalRegistry;
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/api.js
// @__NO_SIDE_EFFECTS__
function Un(e, t) {
	return new e({
		type: "string",
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Wn(e, t) {
	return new e({
		type: "string",
		format: "email",
		check: "string_format",
		abort: !1,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Gn(e, t) {
	return new e({
		type: "string",
		format: "guid",
		check: "string_format",
		abort: !1,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Kn(e, t) {
	return new e({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: !1,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function qn(e, t) {
	return new e({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: !1,
		version: "v4",
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Jn(e, t) {
	return new e({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: !1,
		version: "v6",
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Yn(e, t) {
	return new e({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: !1,
		version: "v7",
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Xn(e, t) {
	return new e({
		type: "string",
		format: "url",
		check: "string_format",
		abort: !1,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Zn(e, t) {
	return new e({
		type: "string",
		format: "emoji",
		check: "string_format",
		abort: !1,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Qn(e, t) {
	return new e({
		type: "string",
		format: "nanoid",
		check: "string_format",
		abort: !1,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function $n(e, t) {
	return new e({
		type: "string",
		format: "cuid",
		check: "string_format",
		abort: !1,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function er(e, t) {
	return new e({
		type: "string",
		format: "cuid2",
		check: "string_format",
		abort: !1,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function tr(e, t) {
	return new e({
		type: "string",
		format: "ulid",
		check: "string_format",
		abort: !1,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function nr(e, t) {
	return new e({
		type: "string",
		format: "xid",
		check: "string_format",
		abort: !1,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function rr(e, t) {
	return new e({
		type: "string",
		format: "ksuid",
		check: "string_format",
		abort: !1,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function ir(e, t) {
	return new e({
		type: "string",
		format: "ipv4",
		check: "string_format",
		abort: !1,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function ar(e, t) {
	return new e({
		type: "string",
		format: "ipv6",
		check: "string_format",
		abort: !1,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function or(e, t) {
	return new e({
		type: "string",
		format: "cidrv4",
		check: "string_format",
		abort: !1,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function sr(e, t) {
	return new e({
		type: "string",
		format: "cidrv6",
		check: "string_format",
		abort: !1,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function cr(e, t) {
	return new e({
		type: "string",
		format: "base64",
		check: "string_format",
		abort: !1,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function lr(e, t) {
	return new e({
		type: "string",
		format: "base64url",
		check: "string_format",
		abort: !1,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function ur(e, t) {
	return new e({
		type: "string",
		format: "e164",
		check: "string_format",
		abort: !1,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function dr(e, t) {
	return new e({
		type: "string",
		format: "jwt",
		check: "string_format",
		abort: !1,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function fr(e, t) {
	return new e({
		type: "string",
		format: "datetime",
		check: "string_format",
		offset: !1,
		local: !1,
		precision: null,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function pr(e, t) {
	return new e({
		type: "string",
		format: "date",
		check: "string_format",
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function mr(e, t) {
	return new e({
		type: "string",
		format: "time",
		check: "string_format",
		precision: null,
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function hr(e, t) {
	return new e({
		type: "string",
		format: "duration",
		check: "string_format",
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function gr(e, t) {
	return new e({
		type: "number",
		checks: [],
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function _r(e, t) {
	return new e({
		type: "number",
		check: "number_format",
		abort: !1,
		format: "safeint",
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function vr(e, t) {
	return new e({
		type: "boolean",
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function yr(e) {
	return new e({ type: "unknown" });
}
// @__NO_SIDE_EFFECTS__
function br(e, t) {
	return new e({
		type: "never",
		...T(t)
	});
}
// @__NO_SIDE_EFFECTS__
function xr(e, t) {
	return new ut({
		check: "less_than",
		...T(t),
		value: e,
		inclusive: !1
	});
}
// @__NO_SIDE_EFFECTS__
function Sr(e, t) {
	return new ut({
		check: "less_than",
		...T(t),
		value: e,
		inclusive: !0
	});
}
// @__NO_SIDE_EFFECTS__
function Cr(e, t) {
	return new dt({
		check: "greater_than",
		...T(t),
		value: e,
		inclusive: !1
	});
}
// @__NO_SIDE_EFFECTS__
function wr(e, t) {
	return new dt({
		check: "greater_than",
		...T(t),
		value: e,
		inclusive: !0
	});
}
// @__NO_SIDE_EFFECTS__
function Tr(e, t) {
	return new ft({
		check: "multiple_of",
		...T(t),
		value: e
	});
}
// @__NO_SIDE_EFFECTS__
function Er(e, t) {
	return new mt({
		check: "max_length",
		...T(t),
		maximum: e
	});
}
// @__NO_SIDE_EFFECTS__
function Dr(e, t) {
	return new ht({
		check: "min_length",
		...T(t),
		minimum: e
	});
}
// @__NO_SIDE_EFFECTS__
function Or(e, t) {
	return new gt({
		check: "length_equals",
		...T(t),
		length: e
	});
}
// @__NO_SIDE_EFFECTS__
function kr(e, t) {
	return new vt({
		check: "string_format",
		format: "regex",
		...T(t),
		pattern: e
	});
}
// @__NO_SIDE_EFFECTS__
function Ar(e) {
	return new yt({
		check: "string_format",
		format: "lowercase",
		...T(e)
	});
}
// @__NO_SIDE_EFFECTS__
function jr(e) {
	return new bt({
		check: "string_format",
		format: "uppercase",
		...T(e)
	});
}
// @__NO_SIDE_EFFECTS__
function Mr(e, t) {
	return new xt({
		check: "string_format",
		format: "includes",
		...T(t),
		includes: e
	});
}
// @__NO_SIDE_EFFECTS__
function Nr(e, t) {
	return new St({
		check: "string_format",
		format: "starts_with",
		...T(t),
		prefix: e
	});
}
// @__NO_SIDE_EFFECTS__
function Pr(e, t) {
	return new Ct({
		check: "string_format",
		format: "ends_with",
		...T(t),
		suffix: e
	});
}
// @__NO_SIDE_EFFECTS__
function Fr(e) {
	return new wt({
		check: "overwrite",
		tx: e
	});
}
// @__NO_SIDE_EFFECTS__
function Ir(e) {
	return /* @__PURE__ */ Fr((t) => t.normalize(e));
}
// @__NO_SIDE_EFFECTS__
function Lr() {
	return /* @__PURE__ */ Fr((e) => e.trim());
}
// @__NO_SIDE_EFFECTS__
function Rr() {
	return /* @__PURE__ */ Fr((e) => e.toLowerCase());
}
// @__NO_SIDE_EFFECTS__
function zr() {
	return /* @__PURE__ */ Fr((e) => e.toUpperCase());
}
// @__NO_SIDE_EFFECTS__
function Br() {
	return /* @__PURE__ */ Fr((e) => _(e));
}
// @__NO_SIDE_EFFECTS__
function Vr(e, t, n) {
	return new e({
		type: "array",
		element: t,
		...T(n)
	});
}
// @__NO_SIDE_EFFECTS__
function Hr(e, t, n) {
	return new e({
		type: "custom",
		check: "custom",
		fn: t,
		...T(n)
	});
}
// @__NO_SIDE_EFFECTS__
function Ur(e, t) {
	let n = /* @__PURE__ */ Wr((t) => (t.addIssue = (e) => {
		if (typeof e == "string") t.issues.push(me(e, t.value, n._zod.def));
		else {
			let r = e;
			r.fatal && (r.continue = !1), r.code ??= "custom", r.input ??= t.value, r.inst ??= n, r.continue ??= !n._zod.def.abort, t.issues.push(me(r));
		}
	}, e(t.value, t)), t);
	return n;
}
// @__NO_SIDE_EFFECTS__
function Wr(e, t) {
	let n = new A({
		check: "custom",
		...T(t)
	});
	return n._zod.check = e, n;
}
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/to-json-schema.js
function Gr(e) {
	let t = e?.target ?? "draft-2020-12";
	return t === "draft-4" && (t = "draft-04"), t === "draft-7" && (t = "draft-07"), {
		processors: e.processors ?? {},
		metadataRegistry: e?.metadata ?? Hn,
		target: t,
		unrepresentable: e?.unrepresentable ?? "throw",
		override: e?.override ?? (() => {}),
		io: e?.io ?? "output",
		counter: 0,
		seen: /* @__PURE__ */ new Map(),
		cycles: e?.cycles ?? "ref",
		reused: e?.reused ?? "inline",
		external: e?.external ?? void 0
	};
}
function N(e, t, n = {
	path: [],
	schemaPath: []
}) {
	var r;
	let i = e._zod.def, a = t.seen.get(e);
	if (a) return a.count++, n.schemaPath.includes(e) && (a.cycle = n.path), a.schema;
	let o = {
		schema: {},
		count: 1,
		cycle: void 0,
		path: n.path
	};
	t.seen.set(e, o);
	let s = e._zod.toJSONSchema?.();
	if (s) o.schema = s;
	else {
		let r = {
			...n,
			schemaPath: [...n.schemaPath, e],
			path: n.path
		};
		if (e._zod.processJSONSchema) e._zod.processJSONSchema(t, o.schema, r);
		else {
			let n = o.schema, a = t.processors[i.type];
			if (!a) throw Error(`[toJSONSchema]: Non-representable type encountered: ${i.type}`);
			a(e, t, n, r);
		}
		let a = e._zod.parent;
		a && (o.ref ||= a, N(a, t, r), t.seen.get(a).isParent = !0);
	}
	let c = t.metadataRegistry.get(e);
	return c && Object.assign(o.schema, c), t.io === "input" && P(e) && (delete o.schema.examples, delete o.schema.default), t.io === "input" && "_prefault" in o.schema && ((r = o.schema).default ?? (r.default = o.schema._prefault)), delete o.schema._prefault, t.seen.get(e).schema;
}
function Kr(e, t) {
	let n = e.seen.get(t);
	if (!n) throw Error("Unprocessed schema. This is a bug in Zod.");
	let r = /* @__PURE__ */ new Map();
	for (let t of e.seen.entries()) {
		let n = e.metadataRegistry.get(t[0])?.id;
		if (n) {
			let e = r.get(n);
			if (e && e !== t[0]) throw Error(`Duplicate schema id "${n}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
			r.set(n, t[0]);
		}
	}
	let i = (t) => {
		let r = e.target === "draft-2020-12" ? "$defs" : "definitions";
		if (e.external) {
			let n = e.external.registry.get(t[0])?.id, i = e.external.uri ?? ((e) => e);
			if (n) return { ref: i(n) };
			let a = t[1].defId ?? t[1].schema.id ?? `schema${e.counter++}`;
			return t[1].defId = a, {
				defId: a,
				ref: `${i("__shared")}#/${r}/${a}`
			};
		}
		if (t[1] === n) return { ref: "#" };
		let i = `#/${r}/`, a = t[1].schema.id ?? `__schema${e.counter++}`;
		return {
			defId: a,
			ref: i + a
		};
	}, a = (e) => {
		if (e[1].schema.$ref) return;
		let t = e[1], { ref: n, defId: r } = i(e);
		t.def = { ...t.schema }, r && (t.defId = r);
		let a = t.schema;
		for (let e in a) delete a[e];
		a.$ref = n;
	};
	if (e.cycles === "throw") for (let t of e.seen.entries()) {
		let e = t[1];
		if (e.cycle) throw Error(`Cycle detected: #/${e.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
	}
	for (let n of e.seen.entries()) {
		let r = n[1];
		if (t === n[0]) {
			a(n);
			continue;
		}
		if (e.external) {
			let r = e.external.registry.get(n[0])?.id;
			if (t !== n[0] && r) {
				a(n);
				continue;
			}
		}
		if (e.metadataRegistry.get(n[0])?.id) {
			a(n);
			continue;
		}
		if (r.cycle) {
			a(n);
			continue;
		}
		if (r.count > 1 && e.reused === "ref") {
			a(n);
			continue;
		}
	}
}
function qr(e, t) {
	let n = e.seen.get(t);
	if (!n) throw Error("Unprocessed schema. This is a bug in Zod.");
	let r = (t) => {
		let n = e.seen.get(t);
		if (n.ref === null) return;
		let i = n.def ?? n.schema, a = { ...i }, o = n.ref;
		if (n.ref = null, o) {
			r(o);
			let n = e.seen.get(o), s = n.schema;
			if (s.$ref && (e.target === "draft-07" || e.target === "draft-04" || e.target === "openapi-3.0") ? (i.allOf = i.allOf ?? [], i.allOf.push(s)) : Object.assign(i, s), Object.assign(i, a), t._zod.parent === o) for (let e in i) e === "$ref" || e === "allOf" || e in a || delete i[e];
			if (s.$ref && n.def) for (let e in i) e === "$ref" || e === "allOf" || e in n.def && JSON.stringify(i[e]) === JSON.stringify(n.def[e]) && delete i[e];
		}
		let s = t._zod.parent;
		if (s && s !== o) {
			r(s);
			let t = e.seen.get(s);
			if (t?.schema.$ref && (i.$ref = t.schema.$ref, t.def)) for (let e in i) e === "$ref" || e === "allOf" || e in t.def && JSON.stringify(i[e]) === JSON.stringify(t.def[e]) && delete i[e];
		}
		e.override({
			zodSchema: t,
			jsonSchema: i,
			path: n.path ?? []
		});
	};
	for (let t of [...e.seen.entries()].reverse()) r(t[0]);
	let i = {};
	if (e.target === "draft-2020-12" ? i.$schema = "https://json-schema.org/draft/2020-12/schema" : e.target === "draft-07" ? i.$schema = "http://json-schema.org/draft-07/schema#" : e.target === "draft-04" ? i.$schema = "http://json-schema.org/draft-04/schema#" : e.target, e.external?.uri) {
		let n = e.external.registry.get(t)?.id;
		if (!n) throw Error("Schema is missing an `id` property");
		i.$id = e.external.uri(n);
	}
	Object.assign(i, n.def ?? n.schema);
	let a = e.metadataRegistry.get(t)?.id;
	a !== void 0 && i.id === a && delete i.id;
	let o = e.external?.defs ?? {};
	for (let t of e.seen.entries()) {
		let e = t[1];
		e.def && e.defId && (e.def.id === e.defId && delete e.def.id, o[e.defId] = e.def);
	}
	e.external || Object.keys(o).length > 0 && (e.target === "draft-2020-12" ? i.$defs = o : i.definitions = o);
	try {
		let n = JSON.parse(JSON.stringify(i));
		return Object.defineProperty(n, "~standard", {
			value: {
				...t["~standard"],
				jsonSchema: {
					input: Yr(t, "input", e.processors),
					output: Yr(t, "output", e.processors)
				}
			},
			enumerable: !1,
			writable: !1
		}), n;
	} catch {
		throw Error("Error converting schema to JSON.");
	}
}
function P(e, t) {
	let n = t ?? { seen: /* @__PURE__ */ new Set() };
	if (n.seen.has(e)) return !1;
	n.seen.add(e);
	let r = e._zod.def;
	if (r.type === "transform") return !0;
	if (r.type === "array") return P(r.element, n);
	if (r.type === "set") return P(r.valueType, n);
	if (r.type === "lazy") return P(r.getter(), n);
	if (r.type === "promise" || r.type === "optional" || r.type === "nonoptional" || r.type === "nullable" || r.type === "readonly" || r.type === "default" || r.type === "prefault") return P(r.innerType, n);
	if (r.type === "intersection") return P(r.left, n) || P(r.right, n);
	if (r.type === "record" || r.type === "map") return P(r.keyType, n) || P(r.valueType, n);
	if (r.type === "pipe") return e._zod.traits.has("$ZodCodec") ? !0 : P(r.in, n) || P(r.out, n);
	if (r.type === "object") {
		for (let e in r.shape) if (P(r.shape[e], n)) return !0;
		return !1;
	}
	if (r.type === "union") {
		for (let e of r.options) if (P(e, n)) return !0;
		return !1;
	}
	if (r.type === "tuple") {
		for (let e of r.items) if (P(e, n)) return !0;
		return !!(r.rest && P(r.rest, n));
	}
	return !1;
}
var Jr = (e, t = {}) => (n) => {
	let r = Gr({
		...n,
		processors: t
	});
	return N(e, r), Kr(r, e), qr(r, e);
}, Yr = (e, t, n = {}) => (r) => {
	let { libraryOptions: i, target: a } = r ?? {}, o = Gr({
		...i ?? {},
		target: a,
		io: t,
		processors: n
	});
	return N(e, o), Kr(o, e), qr(o, e);
}, Xr = {
	guid: "uuid",
	url: "uri",
	datetime: "date-time",
	json_string: "json-string",
	regex: ""
}, Zr = (e, t, n, r) => {
	let i = n;
	i.type = "string";
	let { minimum: a, maximum: o, format: s, patterns: c, contentEncoding: l } = e._zod.bag;
	if (typeof a == "number" && (i.minLength = a), typeof o == "number" && (i.maxLength = o), s && (i.format = Xr[s] ?? s, i.format === "" && delete i.format, s === "time" && delete i.format), l && (i.contentEncoding = l), c && c.size > 0) {
		let e = [...c];
		e.length === 1 ? i.pattern = e[0].source : e.length > 1 && (i.allOf = [...e.map((e) => ({
			...t.target === "draft-07" || t.target === "draft-04" || t.target === "openapi-3.0" ? { type: "string" } : {},
			pattern: e.source
		}))]);
	}
}, Qr = (e, t, n, r) => {
	let i = n, { minimum: a, maximum: o, format: s, multipleOf: c, exclusiveMaximum: l, exclusiveMinimum: u } = e._zod.bag;
	typeof s == "string" && s.includes("int") ? i.type = "integer" : i.type = "number";
	let d = typeof u == "number" && u >= (a ?? -Infinity), f = typeof l == "number" && l <= (o ?? Infinity), p = t.target === "draft-04" || t.target === "openapi-3.0";
	d ? p ? (i.minimum = u, i.exclusiveMinimum = !0) : i.exclusiveMinimum = u : typeof a == "number" && (i.minimum = a), f ? p ? (i.maximum = l, i.exclusiveMaximum = !0) : i.exclusiveMaximum = l : typeof o == "number" && (i.maximum = o), typeof c == "number" && (i.multipleOf = c);
}, $r = (e, t, n, r) => {
	n.type = "boolean";
}, ei = (e, t, n, r) => {
	n.not = {};
}, ti = (e, t, n, r) => {
	let i = e._zod.def, a = o(i.entries);
	a.every((e) => typeof e == "number") && (n.type = "number"), a.every((e) => typeof e == "string") && (n.type = "string"), n.enum = a;
}, ni = (e, t, n, r) => {
	let i = e._zod.def, a = [];
	for (let e of i.values) if (e === void 0) {
		if (t.unrepresentable === "throw") throw Error("Literal `undefined` cannot be represented in JSON Schema");
	} else if (typeof e == "bigint") {
		if (t.unrepresentable === "throw") throw Error("BigInt literals cannot be represented in JSON Schema");
		a.push(Number(e));
	} else a.push(e);
	if (a.length !== 0) if (a.length === 1) {
		let e = a[0];
		n.type = e === null ? "null" : typeof e, t.target === "draft-04" || t.target === "openapi-3.0" ? n.enum = [e] : n.const = e;
	} else a.every((e) => typeof e == "number") && (n.type = "number"), a.every((e) => typeof e == "string") && (n.type = "string"), a.every((e) => typeof e == "boolean") && (n.type = "boolean"), a.every((e) => e === null) && (n.type = "null"), n.enum = a;
}, ri = (e, t, n, r) => {
	if (t.unrepresentable === "throw") throw Error("Custom types cannot be represented in JSON Schema");
}, ii = (e, t, n, r) => {
	if (t.unrepresentable === "throw") throw Error("Transforms cannot be represented in JSON Schema");
}, ai = (e, t, n, r) => {
	let i = n, a = e._zod.def, { minimum: o, maximum: s } = e._zod.bag;
	typeof o == "number" && (i.minItems = o), typeof s == "number" && (i.maxItems = s), i.type = "array", i.items = N(a.element, t, {
		...r,
		path: [...r.path, "items"]
	});
}, oi = (e, t, n, r) => {
	let i = n, a = e._zod.def;
	i.type = "object", i.properties = {};
	let o = a.shape;
	for (let e in o) i.properties[e] = N(o[e], t, {
		...r,
		path: [
			...r.path,
			"properties",
			e
		]
	});
	let s = new Set(Object.keys(o)), c = new Set([...s].filter((e) => {
		let n = a.shape[e]._zod;
		return t.io === "input" ? n.optin === void 0 : n.optout === void 0;
	}));
	c.size > 0 && (i.required = Array.from(c)), a.catchall?._zod.def.type === "never" ? i.additionalProperties = !1 : a.catchall ? a.catchall && (i.additionalProperties = N(a.catchall, t, {
		...r,
		path: [...r.path, "additionalProperties"]
	})) : t.io === "output" && (i.additionalProperties = !1);
}, si = (e, t, n, r) => {
	let i = e._zod.def, a = i.inclusive === !1, o = i.options.map((e, n) => N(e, t, {
		...r,
		path: [
			...r.path,
			a ? "oneOf" : "anyOf",
			n
		]
	}));
	a ? n.oneOf = o : n.anyOf = o;
}, ci = (e, t, n, r) => {
	let i = e._zod.def, a = N(i.left, t, {
		...r,
		path: [
			...r.path,
			"allOf",
			0
		]
	}), o = N(i.right, t, {
		...r,
		path: [
			...r.path,
			"allOf",
			1
		]
	}), s = (e) => "allOf" in e && Object.keys(e).length === 1;
	n.allOf = [...s(a) ? a.allOf : [a], ...s(o) ? o.allOf : [o]];
}, li = (e, t, n, r) => {
	let i = n, a = e._zod.def;
	i.type = "object";
	let o = a.keyType, s = o._zod.bag?.patterns;
	if (a.mode === "loose" && s && s.size > 0) {
		let e = N(a.valueType, t, {
			...r,
			path: [
				...r.path,
				"patternProperties",
				"*"
			]
		});
		i.patternProperties = {};
		for (let t of s) i.patternProperties[t.source] = e;
	} else (t.target === "draft-07" || t.target === "draft-2020-12") && (i.propertyNames = N(a.keyType, t, {
		...r,
		path: [...r.path, "propertyNames"]
	})), i.additionalProperties = N(a.valueType, t, {
		...r,
		path: [...r.path, "additionalProperties"]
	});
	let c = o._zod.values;
	if (c) {
		let e = [...c].filter((e) => typeof e == "string" || typeof e == "number");
		e.length > 0 && (i.required = e);
	}
}, ui = (e, t, n, r) => {
	let i = e._zod.def, a = N(i.innerType, t, r), o = t.seen.get(e);
	t.target === "openapi-3.0" ? (o.ref = i.innerType, n.nullable = !0) : n.anyOf = [a, { type: "null" }];
}, di = (e, t, n, r) => {
	let i = e._zod.def;
	N(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType;
}, fi = (e, t, n, r) => {
	let i = e._zod.def;
	N(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType, n.default = JSON.parse(JSON.stringify(i.defaultValue));
}, pi = (e, t, n, r) => {
	let i = e._zod.def;
	N(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType, t.io === "input" && (n._prefault = JSON.parse(JSON.stringify(i.defaultValue)));
}, mi = (e, t, n, r) => {
	let i = e._zod.def;
	N(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType;
	let o;
	try {
		o = i.catchValue(void 0);
	} catch {
		throw Error("Dynamic catch values are not supported in JSON Schema");
	}
	n.default = o;
}, hi = (e, t, n, r) => {
	let i = e._zod.def, a = i.in._zod.traits.has("$ZodTransform"), o = t.io === "input" ? a ? i.out : i.in : i.out;
	N(o, t, r);
	let s = t.seen.get(e);
	s.ref = o;
}, gi = (e, t, n, r) => {
	let i = e._zod.def;
	N(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType, n.readOnly = !0;
}, _i = (e, t, n, r) => {
	let i = e._zod.def;
	N(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType;
}, vi = /*@__PURE__*/ t("ZodISODateTime", (e, t) => {
	zt.init(e, t), L.init(e, t);
});
function yi(e) {
	return /* @__PURE__ */ fr(vi, e);
}
var bi = /*@__PURE__*/ t("ZodISODate", (e, t) => {
	Bt.init(e, t), L.init(e, t);
});
function xi(e) {
	return /* @__PURE__ */ pr(bi, e);
}
var Si = /*@__PURE__*/ t("ZodISOTime", (e, t) => {
	Vt.init(e, t), L.init(e, t);
});
function Ci(e) {
	return /* @__PURE__ */ mr(Si, e);
}
var wi = /*@__PURE__*/ t("ZodISODuration", (e, t) => {
	Ht.init(e, t), L.init(e, t);
});
function Ti(e) {
	return /* @__PURE__ */ hr(wi, e);
}
var Ei = /*@__PURE__*/ t("ZodError", (e, t) => {
	ge.init(e, t), e.name = "ZodError", Object.defineProperties(e, {
		format: { value: (t) => ve(e, t) },
		flatten: { value: (t) => _e(e, t) },
		addIssue: { value: (t) => {
			e.issues.push(t), e.message = JSON.stringify(e.issues, s, 2);
		} },
		addIssues: { value: (t) => {
			e.issues.push(...t), e.message = JSON.stringify(e.issues, s, 2);
		} },
		isEmpty: { get() {
			return e.issues.length === 0;
		} }
	});
}, { Parent: Error }), Di = /* @__PURE__ */ ye(Ei), Oi = /* @__PURE__ */ be(Ei), ki = /* @__PURE__ */ xe(Ei), Ai = /* @__PURE__ */ k(Ei), ji = /* @__PURE__ */ we(Ei), Mi = /* @__PURE__ */ Te(Ei), Ni = /* @__PURE__ */ Ee(Ei), Pi = /* @__PURE__ */ De(Ei), Fi = /* @__PURE__ */ Oe(Ei), Ii = /* @__PURE__ */ ke(Ei), Li = /* @__PURE__ */ Ae(Ei), Ri = /* @__PURE__ */ je(Ei), zi = /* @__PURE__ */ new WeakMap();
function Bi(e, t, n) {
	let r = Object.getPrototypeOf(e), i = zi.get(r);
	if (i || (i = /* @__PURE__ */ new Set(), zi.set(r, i)), !i.has(t)) {
		i.add(t);
		for (let e in n) {
			let t = n[e];
			Object.defineProperty(r, e, {
				configurable: !0,
				enumerable: !1,
				get() {
					let n = t.bind(this);
					return Object.defineProperty(this, e, {
						configurable: !0,
						writable: !0,
						enumerable: !0,
						value: n
					}), n;
				},
				set(t) {
					Object.defineProperty(this, e, {
						configurable: !0,
						writable: !0,
						enumerable: !0,
						value: t
					});
				}
			});
		}
	}
}
var F = /*@__PURE__*/ t("ZodType", (e, t) => (j.init(e, t), Object.assign(e["~standard"], { jsonSchema: {
	input: Yr(e, "input"),
	output: Yr(e, "output")
} }), e.toJSONSchema = Jr(e, {}), e.def = t, e.type = t.type, Object.defineProperty(e, "_def", { value: t }), e.parse = (t, n) => Di(e, t, n, { callee: e.parse }), e.safeParse = (t, n) => ki(e, t, n), e.parseAsync = async (t, n) => Oi(e, t, n, { callee: e.parseAsync }), e.safeParseAsync = async (t, n) => Ai(e, t, n), e.spa = e.safeParseAsync, e.encode = (t, n) => ji(e, t, n), e.decode = (t, n) => Mi(e, t, n), e.encodeAsync = async (t, n) => Ni(e, t, n), e.decodeAsync = async (t, n) => Pi(e, t, n), e.safeEncode = (t, n) => Fi(e, t, n), e.safeDecode = (t, n) => Ii(e, t, n), e.safeEncodeAsync = async (t, n) => Li(e, t, n), e.safeDecodeAsync = async (t, n) => Ri(e, t, n), Bi(e, "ZodType", {
	check(...e) {
		let t = this.def;
		return this.clone(h(t, { checks: [...t.checks ?? [], ...e.map((e) => typeof e == "function" ? { _zod: {
			check: e,
			def: { check: "custom" },
			onattach: []
		} } : e)] }), { parent: !0 });
	},
	with(...e) {
		return this.check(...e);
	},
	clone(e, t) {
		return w(this, e, t);
	},
	brand() {
		return this;
	},
	register(e, t) {
		return e.add(this, t), this;
	},
	refine(e, t) {
		return this.check($a(e, t));
	},
	superRefine(e, t) {
		return this.check(eo(e, t));
	},
	overwrite(e) {
		return this.check(/* @__PURE__ */ Fr(e));
	},
	optional() {
		return Fa(this);
	},
	exactOptional() {
		return La(this);
	},
	nullable() {
		return za(this);
	},
	nullish() {
		return Fa(za(this));
	},
	nonoptional(e) {
		return Ga(this, e);
	},
	array() {
		return va(this);
	},
	or(e) {
		return xa([this, e]);
	},
	and(e) {
		return Ta(this, e);
	},
	transform(e) {
		return Ya(this, Na(e));
	},
	default(e) {
		return Va(this, e);
	},
	prefault(e) {
		return Ua(this, e);
	},
	catch(e) {
		return qa(this, e);
	},
	pipe(e) {
		return Ya(this, e);
	},
	readonly() {
		return Za(this);
	},
	describe(e) {
		let t = this.clone();
		return Hn.add(t, { description: e }), t;
	},
	meta(...e) {
		if (e.length === 0) return Hn.get(this);
		let t = this.clone();
		return Hn.add(t, e[0]), t;
	},
	isOptional() {
		return this.safeParse(void 0).success;
	},
	isNullable() {
		return this.safeParse(null).success;
	},
	apply(e) {
		return e(this);
	}
}), Object.defineProperty(e, "description", {
	get() {
		return Hn.get(e)?.description;
	},
	configurable: !0
}), e)), Vi = /*@__PURE__*/ t("_ZodString", (e, t) => {
	Dt.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => Zr(e, t, n, r);
	let n = e._zod.bag;
	e.format = n.format ?? null, e.minLength = n.minimum ?? null, e.maxLength = n.maximum ?? null, Bi(e, "_ZodString", {
		regex(...e) {
			return this.check(/* @__PURE__ */ kr(...e));
		},
		includes(...e) {
			return this.check(/* @__PURE__ */ Mr(...e));
		},
		startsWith(...e) {
			return this.check(/* @__PURE__ */ Nr(...e));
		},
		endsWith(...e) {
			return this.check(/* @__PURE__ */ Pr(...e));
		},
		min(...e) {
			return this.check(/* @__PURE__ */ Dr(...e));
		},
		max(...e) {
			return this.check(/* @__PURE__ */ Er(...e));
		},
		length(...e) {
			return this.check(/* @__PURE__ */ Or(...e));
		},
		nonempty(...e) {
			return this.check(/* @__PURE__ */ Dr(1, ...e));
		},
		lowercase(e) {
			return this.check(/* @__PURE__ */ Ar(e));
		},
		uppercase(e) {
			return this.check(/* @__PURE__ */ jr(e));
		},
		trim() {
			return this.check(/* @__PURE__ */ Lr());
		},
		normalize(...e) {
			return this.check(/* @__PURE__ */ Ir(...e));
		},
		toLowerCase() {
			return this.check(/* @__PURE__ */ Rr());
		},
		toUpperCase() {
			return this.check(/* @__PURE__ */ zr());
		},
		slugify() {
			return this.check(/* @__PURE__ */ Br());
		}
	});
}), Hi = /*@__PURE__*/ t("ZodString", (e, t) => {
	Dt.init(e, t), Vi.init(e, t), e.email = (t) => e.check(/* @__PURE__ */ Wn(Ui, t)), e.url = (t) => e.check(/* @__PURE__ */ Xn(Ki, t)), e.jwt = (t) => e.check(/* @__PURE__ */ dr(sa, t)), e.emoji = (t) => e.check(/* @__PURE__ */ Zn(qi, t)), e.guid = (t) => e.check(/* @__PURE__ */ Gn(Wi, t)), e.uuid = (t) => e.check(/* @__PURE__ */ Kn(Gi, t)), e.uuidv4 = (t) => e.check(/* @__PURE__ */ qn(Gi, t)), e.uuidv6 = (t) => e.check(/* @__PURE__ */ Jn(Gi, t)), e.uuidv7 = (t) => e.check(/* @__PURE__ */ Yn(Gi, t)), e.nanoid = (t) => e.check(/* @__PURE__ */ Qn(Ji, t)), e.guid = (t) => e.check(/* @__PURE__ */ Gn(Wi, t)), e.cuid = (t) => e.check(/* @__PURE__ */ $n(Yi, t)), e.cuid2 = (t) => e.check(/* @__PURE__ */ er(Xi, t)), e.ulid = (t) => e.check(/* @__PURE__ */ tr(Zi, t)), e.base64 = (t) => e.check(/* @__PURE__ */ cr(ia, t)), e.base64url = (t) => e.check(/* @__PURE__ */ lr(aa, t)), e.xid = (t) => e.check(/* @__PURE__ */ nr(Qi, t)), e.ksuid = (t) => e.check(/* @__PURE__ */ rr($i, t)), e.ipv4 = (t) => e.check(/* @__PURE__ */ ir(ea, t)), e.ipv6 = (t) => e.check(/* @__PURE__ */ ar(ta, t)), e.cidrv4 = (t) => e.check(/* @__PURE__ */ or(na, t)), e.cidrv6 = (t) => e.check(/* @__PURE__ */ sr(ra, t)), e.e164 = (t) => e.check(/* @__PURE__ */ ur(oa, t)), e.datetime = (t) => e.check(yi(t)), e.date = (t) => e.check(xi(t)), e.time = (t) => e.check(Ci(t)), e.duration = (t) => e.check(Ti(t));
});
function I(e) {
	return /* @__PURE__ */ Un(Hi, e);
}
var L = /*@__PURE__*/ t("ZodStringFormat", (e, t) => {
	M.init(e, t), Vi.init(e, t);
}), Ui = /*@__PURE__*/ t("ZodEmail", (e, t) => {
	At.init(e, t), L.init(e, t);
}), Wi = /*@__PURE__*/ t("ZodGUID", (e, t) => {
	Ot.init(e, t), L.init(e, t);
}), Gi = /*@__PURE__*/ t("ZodUUID", (e, t) => {
	kt.init(e, t), L.init(e, t);
}), Ki = /*@__PURE__*/ t("ZodURL", (e, t) => {
	jt.init(e, t), L.init(e, t);
}), qi = /*@__PURE__*/ t("ZodEmoji", (e, t) => {
	Mt.init(e, t), L.init(e, t);
}), Ji = /*@__PURE__*/ t("ZodNanoID", (e, t) => {
	Nt.init(e, t), L.init(e, t);
}), Yi = /*@__PURE__*/ t("ZodCUID", (e, t) => {
	Pt.init(e, t), L.init(e, t);
}), Xi = /*@__PURE__*/ t("ZodCUID2", (e, t) => {
	Ft.init(e, t), L.init(e, t);
}), Zi = /*@__PURE__*/ t("ZodULID", (e, t) => {
	It.init(e, t), L.init(e, t);
}), Qi = /*@__PURE__*/ t("ZodXID", (e, t) => {
	Lt.init(e, t), L.init(e, t);
}), $i = /*@__PURE__*/ t("ZodKSUID", (e, t) => {
	Rt.init(e, t), L.init(e, t);
}), ea = /*@__PURE__*/ t("ZodIPv4", (e, t) => {
	Ut.init(e, t), L.init(e, t);
}), ta = /*@__PURE__*/ t("ZodIPv6", (e, t) => {
	Wt.init(e, t), L.init(e, t);
}), na = /*@__PURE__*/ t("ZodCIDRv4", (e, t) => {
	Gt.init(e, t), L.init(e, t);
}), ra = /*@__PURE__*/ t("ZodCIDRv6", (e, t) => {
	Kt.init(e, t), L.init(e, t);
}), ia = /*@__PURE__*/ t("ZodBase64", (e, t) => {
	Jt.init(e, t), L.init(e, t);
}), aa = /*@__PURE__*/ t("ZodBase64URL", (e, t) => {
	Xt.init(e, t), L.init(e, t);
}), oa = /*@__PURE__*/ t("ZodE164", (e, t) => {
	Zt.init(e, t), L.init(e, t);
}), sa = /*@__PURE__*/ t("ZodJWT", (e, t) => {
	$t.init(e, t), L.init(e, t);
}), ca = /*@__PURE__*/ t("ZodNumber", (e, t) => {
	en.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => Qr(e, t, n, r), Bi(e, "ZodNumber", {
		gt(e, t) {
			return this.check(/* @__PURE__ */ Cr(e, t));
		},
		gte(e, t) {
			return this.check(/* @__PURE__ */ wr(e, t));
		},
		min(e, t) {
			return this.check(/* @__PURE__ */ wr(e, t));
		},
		lt(e, t) {
			return this.check(/* @__PURE__ */ xr(e, t));
		},
		lte(e, t) {
			return this.check(/* @__PURE__ */ Sr(e, t));
		},
		max(e, t) {
			return this.check(/* @__PURE__ */ Sr(e, t));
		},
		int(e) {
			return this.check(ua(e));
		},
		safe(e) {
			return this.check(ua(e));
		},
		positive(e) {
			return this.check(/* @__PURE__ */ Cr(0, e));
		},
		nonnegative(e) {
			return this.check(/* @__PURE__ */ wr(0, e));
		},
		negative(e) {
			return this.check(/* @__PURE__ */ xr(0, e));
		},
		nonpositive(e) {
			return this.check(/* @__PURE__ */ Sr(0, e));
		},
		multipleOf(e, t) {
			return this.check(/* @__PURE__ */ Tr(e, t));
		},
		step(e, t) {
			return this.check(/* @__PURE__ */ Tr(e, t));
		},
		finite() {
			return this;
		}
	});
	let n = e._zod.bag;
	e.minValue = Math.max(n.minimum ?? -Infinity, n.exclusiveMinimum ?? -Infinity) ?? null, e.maxValue = Math.min(n.maximum ?? Infinity, n.exclusiveMaximum ?? Infinity) ?? null, e.isInt = (n.format ?? "").includes("int") || Number.isSafeInteger(n.multipleOf ?? .5), e.isFinite = !0, e.format = n.format ?? null;
});
function R(e) {
	return /* @__PURE__ */ gr(ca, e);
}
var la = /*@__PURE__*/ t("ZodNumberFormat", (e, t) => {
	tn.init(e, t), ca.init(e, t);
});
function ua(e) {
	return /* @__PURE__ */ _r(la, e);
}
var da = /*@__PURE__*/ t("ZodBoolean", (e, t) => {
	nn.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => $r(e, t, n, r);
});
function fa(e) {
	return /* @__PURE__ */ vr(da, e);
}
var pa = /*@__PURE__*/ t("ZodUnknown", (e, t) => {
	rn.init(e, t), F.init(e, t), e._zod.processJSONSchema = (e, t, n) => void 0;
});
function ma() {
	return /* @__PURE__ */ yr(pa);
}
var ha = /*@__PURE__*/ t("ZodNever", (e, t) => {
	an.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => ei(e, t, n, r);
});
function ga(e) {
	return /* @__PURE__ */ br(ha, e);
}
var _a = /*@__PURE__*/ t("ZodArray", (e, t) => {
	sn.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => ai(e, t, n, r), e.element = t.element, Bi(e, "ZodArray", {
		min(e, t) {
			return this.check(/* @__PURE__ */ Dr(e, t));
		},
		nonempty(e) {
			return this.check(/* @__PURE__ */ Dr(1, e));
		},
		max(e, t) {
			return this.check(/* @__PURE__ */ Er(e, t));
		},
		length(e, t) {
			return this.check(/* @__PURE__ */ Or(e, t));
		},
		unwrap() {
			return this.element;
		}
	});
});
function va(e, t) {
	return /* @__PURE__ */ Vr(_a, e, t);
}
var ya = /*@__PURE__*/ t("ZodObject", (e, t) => {
	fn.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => oi(e, t, n, r), p(e, "shape", () => t.shape), Bi(e, "ZodObject", {
		keyof() {
			return ka(Object.keys(this._zod.def.shape));
		},
		catchall(e) {
			return this.clone({
				...this._zod.def,
				catchall: e
			});
		},
		passthrough() {
			return this.clone({
				...this._zod.def,
				catchall: ma()
			});
		},
		loose() {
			return this.clone({
				...this._zod.def,
				catchall: ma()
			});
		},
		strict() {
			return this.clone({
				...this._zod.def,
				catchall: ga()
			});
		},
		strip() {
			return this.clone({
				...this._zod.def,
				catchall: void 0
			});
		},
		extend(e) {
			return D(this, e);
		},
		safeExtend(e) {
			return ie(this, e);
		},
		merge(e) {
			return ae(this, e);
		},
		pick(e) {
			return re(this, e);
		},
		omit(e) {
			return E(this, e);
		},
		partial(...e) {
			return oe(Pa, this, e[0]);
		},
		required(...e) {
			return se(Wa, this, e[0]);
		}
	});
});
function z(e, t) {
	return new ya({
		type: "object",
		shape: e ?? {},
		...T(t)
	});
}
var ba = /*@__PURE__*/ t("ZodUnion", (e, t) => {
	mn.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => si(e, t, n, r), e.options = t.options;
});
function xa(e, t) {
	return new ba({
		type: "union",
		options: e,
		...T(t)
	});
}
var Sa = /*@__PURE__*/ t("ZodDiscriminatedUnion", (e, t) => {
	ba.init(e, t), hn.init(e, t);
});
function Ca(e, t, n) {
	return new Sa({
		type: "union",
		options: t,
		discriminator: e,
		...T(n)
	});
}
var wa = /*@__PURE__*/ t("ZodIntersection", (e, t) => {
	gn.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => ci(e, t, n, r);
});
function Ta(e, t) {
	return new wa({
		type: "intersection",
		left: e,
		right: t
	});
}
var Ea = /*@__PURE__*/ t("ZodRecord", (e, t) => {
	yn.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => li(e, t, n, r), e.keyType = t.keyType, e.valueType = t.valueType;
});
function Da(e, t, n) {
	return !t || !t._zod ? new Ea({
		type: "record",
		keyType: I(),
		valueType: e,
		...T(t)
	}) : new Ea({
		type: "record",
		keyType: e,
		valueType: t,
		...T(n)
	});
}
var Oa = /*@__PURE__*/ t("ZodEnum", (e, t) => {
	bn.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => ti(e, t, n, r), e.enum = t.entries, e.options = Object.values(t.entries);
	let n = new Set(Object.keys(t.entries));
	e.extract = (e, r) => {
		let i = {};
		for (let r of e) if (n.has(r)) i[r] = t.entries[r];
		else throw Error(`Key ${r} not found in enum`);
		return new Oa({
			...t,
			checks: [],
			...T(r),
			entries: i
		});
	}, e.exclude = (e, r) => {
		let i = { ...t.entries };
		for (let t of e) if (n.has(t)) delete i[t];
		else throw Error(`Key ${t} not found in enum`);
		return new Oa({
			...t,
			checks: [],
			...T(r),
			entries: i
		});
	};
});
function ka(e, t) {
	return new Oa({
		type: "enum",
		entries: Array.isArray(e) ? Object.fromEntries(e.map((e) => [e, e])) : e,
		...T(t)
	});
}
var Aa = /*@__PURE__*/ t("ZodLiteral", (e, t) => {
	xn.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => ni(e, t, n, r), e.values = new Set(t.values), Object.defineProperty(e, "value", { get() {
		if (t.values.length > 1) throw Error("This schema contains multiple valid literal values. Use `.values` instead.");
		return t.values[0];
	} });
});
function ja(e, t) {
	return new Aa({
		type: "literal",
		values: Array.isArray(e) ? e : [e],
		...T(t)
	});
}
var Ma = /*@__PURE__*/ t("ZodTransform", (e, t) => {
	Sn.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => ii(e, t, n, r), e._zod.parse = (n, i) => {
		if (i.direction === "backward") throw new r(e.constructor.name);
		n.addIssue = (r) => {
			if (typeof r == "string") n.issues.push(me(r, n.value, t));
			else {
				let t = r;
				t.fatal && (t.continue = !1), t.code ??= "custom", t.input ??= n.value, t.inst ??= e, n.issues.push(me(t));
			}
		};
		let a = t.transform(n.value, n);
		return a instanceof Promise ? a.then((e) => (n.value = e, n.fallback = !0, n)) : (n.value = a, n.fallback = !0, n);
	};
});
function Na(e) {
	return new Ma({
		type: "transform",
		transform: e
	});
}
var Pa = /*@__PURE__*/ t("ZodOptional", (e, t) => {
	wn.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => _i(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function Fa(e) {
	return new Pa({
		type: "optional",
		innerType: e
	});
}
var Ia = /*@__PURE__*/ t("ZodExactOptional", (e, t) => {
	Tn.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => _i(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function La(e) {
	return new Ia({
		type: "optional",
		innerType: e
	});
}
var Ra = /*@__PURE__*/ t("ZodNullable", (e, t) => {
	En.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => ui(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function za(e) {
	return new Ra({
		type: "nullable",
		innerType: e
	});
}
var Ba = /*@__PURE__*/ t("ZodDefault", (e, t) => {
	Dn.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => fi(e, t, n, r), e.unwrap = () => e._zod.def.innerType, e.removeDefault = e.unwrap;
});
function Va(e, t) {
	return new Ba({
		type: "default",
		innerType: e,
		get defaultValue() {
			return typeof t == "function" ? t() : S(t);
		}
	});
}
var Ha = /*@__PURE__*/ t("ZodPrefault", (e, t) => {
	kn.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => pi(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function Ua(e, t) {
	return new Ha({
		type: "prefault",
		innerType: e,
		get defaultValue() {
			return typeof t == "function" ? t() : S(t);
		}
	});
}
var Wa = /*@__PURE__*/ t("ZodNonOptional", (e, t) => {
	An.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => di(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function Ga(e, t) {
	return new Wa({
		type: "nonoptional",
		innerType: e,
		...T(t)
	});
}
var Ka = /*@__PURE__*/ t("ZodCatch", (e, t) => {
	Mn.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => mi(e, t, n, r), e.unwrap = () => e._zod.def.innerType, e.removeCatch = e.unwrap;
});
function qa(e, t) {
	return new Ka({
		type: "catch",
		innerType: e,
		catchValue: typeof t == "function" ? t : () => t
	});
}
var Ja = /*@__PURE__*/ t("ZodPipe", (e, t) => {
	Nn.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => hi(e, t, n, r), e.in = t.in, e.out = t.out;
});
function Ya(e, t) {
	return new Ja({
		type: "pipe",
		in: e,
		out: t
	});
}
var Xa = /*@__PURE__*/ t("ZodReadonly", (e, t) => {
	Fn.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => gi(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function Za(e) {
	return new Xa({
		type: "readonly",
		innerType: e
	});
}
var Qa = /*@__PURE__*/ t("ZodCustom", (e, t) => {
	Ln.init(e, t), F.init(e, t), e._zod.processJSONSchema = (t, n, r) => ri(e, t, n, r);
});
function $a(e, t = {}) {
	return /* @__PURE__ */ Hr(Qa, e, t);
}
function eo(e, t) {
	return /* @__PURE__ */ Ur(e, t);
}
var to = .6, no = [
	"cut",
	"morph",
	"dissolve",
	"slide",
	"scale",
	"blur",
	"wipe",
	"circle"
], ro = [
	"left",
	"right",
	"up",
	"down"
], io = ["slide", "wipe"], ao = z({
	color: ka([
		"gray",
		"blue",
		"green",
		"amber",
		"red",
		"violet",
		"teal",
		"pink"
	]).optional(),
	text: I().min(1).max(4).optional()
}), oo = z({
	"--scene-bg": I().default("#0f1620"),
	"--scene-ink": I().default("#e8eef6"),
	"--scene-ink-muted": I().default("#93a4b8"),
	"--scene-accent": I().default("#4c8dff"),
	"--scene-accent-ink": I().default("#06121f"),
	"--scene-surface": I().default("#1b2430"),
	"--scene-line": I().default("#2c3a4c"),
	"--scene-font": I().default("system-ui, sans-serif"),
	"--scene-font-display": I().default("Georgia, serif"),
	"--scene-radius": I().default("28px")
}), B = I().min(1).refine((e) => e === e.trim(), { message: "Идентификатор не должен начинаться или заканчиваться пробелом" }), so = R().finite().nonnegative(), co = z({
	text: I().min(1),
	start: so,
	end: so,
	source: ka([
		"alignment",
		"tts",
		"asr",
		"manual"
	]),
	confidence: R().min(0).max(1).optional()
}).refine((e) => e.end >= e.start, { message: "Конец слова не может быть раньше начала" }), lo = z({
	text: I().min(1),
	before: I(),
	after: I()
}), uo = Ca("kind", [
	z({
		kind: ja("seconds"),
		t: so
	}),
	z({
		kind: ja("word"),
		wordIndex: R().int().nonnegative(),
		offset: R().finite(),
		anchor: lo
	}),
	z({
		kind: ja("orphan"),
		wordIndex: R().int().nonnegative(),
		offset: R().finite(),
		lost: lo
	})
]), fo = [
	"text",
	"image",
	"shape",
	"video",
	"group"
], po = Da(I(), xa([I(), R()])), mo = I().regex(/^[A-Za-z0-9_-]+$/, { message: "Идентификатор стиля попадает в селектор CSS: только латиница, цифры, дефис и подчёркивание" }), ho = z({
	id: mo,
	name: I().min(1),
	type: ka(fo),
	props: po.default({})
}), go = z({
	id: B,
	type: ka(fo),
	content: I().default(""),
	parentId: I().optional(),
	locked: fa().default(!1)
}), _o = z({
	x: R().finite(),
	y: R().finite(),
	width: R().finite().nonnegative(),
	height: R().finite().nonnegative(),
	rotation: R().finite().default(0),
	zIndex: R().int().default(0),
	opacity: R().min(0).max(1).default(1),
	visible: fa().default(!0),
	flipX: fa().default(!1),
	flipY: fa().default(!1),
	style: po.default({}),
	styleId: mo.optional()
}), vo = z({
	id: B,
	at: uo,
	transition: ka(no).default("morph"),
	transitionSeconds: R().nonnegative().default(to),
	transitionDirection: ka(ro).optional(),
	states: Da(B, _o)
}).superRefine((e, t) => {
	e.transitionDirection !== void 0 && (io.includes(e.transition) || t.addIssue({
		code: "custom",
		path: ["transitionDirection"],
		message: `Направление задано, но приём «${e.transition}» его не имеет. Направление есть только у: ${io.join(", ")}.`
	}));
}), yo = va(Ca("kind", [
	z({
		kind: ja("equals"),
		variable: B,
		value: I()
	}),
	z({
		kind: ja("notEquals"),
		variable: B,
		value: I()
	}),
	z({
		kind: ja("correct"),
		variable: B
	}),
	z({
		kind: ja("wrong"),
		variable: B
	}),
	z({
		kind: ja("compare"),
		variable: B,
		op: ka([
			"gt",
			"gte",
			"lt",
			"lte"
		]),
		value: R().finite()
	})
])).min(1), bo = z({
	id: B,
	at: uo,
	config: Ca("kind", [
		z({
			kind: ja("choice"),
			prompt: I(),
			options: va(z({
				id: B,
				label: I(),
				when: yo.optional(),
				elementId: B.optional()
			})).min(2),
			correctId: B.nullable(),
			promptElementId: B.optional()
		}),
		z({
			kind: ja("input"),
			prompt: I(),
			accept: va(I().min(1)).min(1),
			caseSensitive: fa().default(!1)
		}),
		z({
			kind: ja("continue"),
			label: I().default("Дальше")
		})
	]),
	onWrong: ka([
		"inline-hint",
		"inline-explain",
		"retry",
		"continue"
	]).default("retry"),
	maxAttempts: R().int().positive().nullable().default(null),
	recordAs: B
}).refine((e) => {
	let t = e.config;
	return t.kind !== "choice" || t.correctId === null || t.options.some((e) => e.id === t.correctId);
}, { message: "correctId должен указывать на один из вариантов" }).refine((e) => {
	let t = e.config;
	return t.kind !== "choice" || t.options.some((e) => e.when === void 0);
}, { message: "Хотя бы один вариант ответа обязан быть безусловным: иначе при неудачном наборе переменных скроются все, и зритель упрётся в вопрос без ответов" }).refine((e) => {
	let t = e.config;
	if (t.kind !== "choice" || t.correctId === null) return !0;
	let n = t.options.find((e) => e.id === t.correctId);
	return n === void 0 || n.when === void 0;
}, { message: "Верный вариант ответа не может быть условным: спрятав его условием, автор делает вопрос непроходимым молча" }), xo = z({
	rules: va(z({
		id: B,
		when: yo,
		goto: B
	})).default([]),
	default: B.nullable().default(null)
}), So = z({
	elementId: B,
	from: uo,
	to: uo
}), Co = z({
	id: B,
	title: I().default(""),
	description: I().default(""),
	badge: ao.optional(),
	speech: I().min(1).optional(),
	audio: z({
		src: I().min(1).optional(),
		fileId: I().min(1).optional(),
		offset: so.default(0),
		duration: R().finite().positive(),
		words: va(co)
	}).superRefine((e, t) => {
		if (e.src !== void 0 && e.fileId !== void 0) {
			t.addIssue({
				code: "custom",
				message: "У дорожки не может быть двух источников сразу: либо src (файл на сервере), либо fileId (файл, загруженный автором)."
			});
			return;
		}
		e.src !== void 0 || e.fileId !== void 0 || (e.words.length > 0 && t.addIssue({
			code: "custom",
			path: ["words"],
			message: `У немого сегмента нет дорожки, а расшифровка описывает то, что прозвучало: слов быть не может, а их ${e.words.length}.`
		}), e.offset !== 0 && t.addIssue({
			code: "custom",
			path: ["offset"],
			message: `Смещение отсчитывается от начала ФАЙЛА, а у немого сегмента файла нет: ожидался 0, получено ${e.offset}.`
		}));
	}),
	elements: va(go),
	slides: va(vo).min(1),
	gates: va(bo).default([]),
	authorSpans: va(So).default([]),
	exit: xo
}).superRefine((e, t) => {
	let n = new Map(e.elements.map((e) => [e.id, e]));
	for (let [r, i] of e.elements.entries()) {
		let { parentId: e } = i;
		if (e === void 0) continue;
		let a = n.get(e);
		if (!a) {
			t.addIssue({
				code: "custom",
				path: [
					"elements",
					r,
					"parentId"
				],
				message: `Элемент «${i.id}» ссылается на группу «${e}», которой нет в этом сегменте.`
			});
			continue;
		}
		if (a.type !== "group") {
			t.addIssue({
				code: "custom",
				path: [
					"elements",
					r,
					"parentId"
				],
				message: `Элемент «${i.id}» вложен в «${e}», а тот имеет тип «${a.type}». Вкладывать можно только в group.`
			});
			continue;
		}
		let o = /* @__PURE__ */ new Set([i.id]), s = e;
		for (; s !== void 0;) {
			if (o.has(s)) {
				t.addIssue({
					code: "custom",
					path: [
						"elements",
						r,
						"parentId"
					],
					message: `Вложенность зациклена: «${i.id}» оказывается собственным предком.`
				});
				break;
			}
			o.add(s), s = n.get(s)?.parentId;
		}
	}
	for (let [n, r] of e.slides.entries()) for (let i of e.elements) i.parentId !== void 0 && r.states[i.id] !== void 0 && r.states[i.parentId] === void 0 && t.addIssue({
		code: "custom",
		path: [
			"slides",
			n,
			"states",
			i.id
		],
		message: `Элемент «${i.id}» есть на слайде, а его группы «${i.parentId}» — нет. Координаты ребёнка отсчитываются от группы, поэтому позиции у него не было бы.`
	});
});
z({
	entry: B,
	segments: va(Co).min(1)
});
var wo = z({
	schemaVersion: ja(16),
	meta: z({
		title: I(),
		stageWidth: R().int().positive().default(1920),
		stageHeight: R().int().positive().default(1080),
		theme: oo.prefault({})
	}),
	entry: B,
	segments: va(Co).min(1),
	styles: va(ho).default([])
}).superRefine((e, t) => {
	let { segments: n, entry: r } = e, i = new Set(n.map((e) => e.id));
	i.size !== n.length && t.addIssue({
		code: "custom",
		path: ["segments"],
		message: "Идентификатор сегмента повторяется"
	});
	let a = new Map(e.styles.map((e) => [e.id, e.type]));
	a.size !== e.styles.length && t.addIssue({
		code: "custom",
		path: ["styles"],
		message: "Идентификатор стиля повторяется"
	}), i.has(r) || t.addIssue({
		code: "custom",
		path: ["entry"],
		message: `Стартовый сегмент «${r}» не существует`
	});
	let o = /* @__PURE__ */ new Map();
	for (let e of n) for (let n of e.gates) {
		let r = o.get(n.recordAs);
		if (r) {
			t.addIssue({
				code: "custom",
				path: ["segments"],
				message: `Переменная «${n.recordAs}» записывается дважды: в сегменте «${r.segmentId}» и в «${e.id}». Второй ответ затёр бы первый, и правило выхода стало бы неоднозначным.`
			});
			continue;
		}
		let i = n.config;
		o.set(n.recordAs, {
			kind: i.kind,
			segmentId: e.id,
			optionIds: i.kind === "choice" ? i.options.map((e) => e.id) : [],
			isFork: i.kind === "choice" && i.correctId === null
		});
	}
	n.forEach((e, n) => {
		let r = (...e) => [
			"segments",
			n,
			...e
		], s = new Set(e.elements.map((e) => e.id)), c = e.audio.words.length;
		s.size !== e.elements.length && t.addIssue({
			code: "custom",
			path: r("elements"),
			message: `Сегмент «${e.id}»: идентификатор элемента повторяется`
		}), e.gates.forEach((n, i) => {
			if (n.config.kind !== "choice") return;
			let a = n.config.promptElementId;
			a !== void 0 && !s.has(a) && t.addIssue({
				code: "custom",
				path: r("gates", i, "config", "promptElementId"),
				message: `Вопрос остановки «${n.id}» показан элементом «${a}», которого нет в сегменте «${e.id}»`
			}), n.config.options.forEach((a, o) => {
				a.elementId !== void 0 && (s.has(a.elementId) || t.addIssue({
					code: "custom",
					path: r("gates", i, "config", "options", o, "elementId"),
					message: `Ответ «${a.id}» остановки «${n.id}» назначен элементу «${a.elementId}», которого нет в сегменте «${e.id}»`
				}));
			});
		});
		let l = new Map(e.elements.map((e) => [e.id, e.type]));
		for (let [n, i] of e.slides.entries()) for (let [e, o] of Object.entries(i.states)) {
			if (o.styleId === void 0) continue;
			let i = r("slides", n, "states", e, "styleId"), s = a.get(o.styleId);
			if (s === void 0) {
				t.addIssue({
					code: "custom",
					path: i,
					message: `Стиль «${o.styleId}» не существует в проекте`
				});
				continue;
			}
			let c = l.get(e);
			c !== void 0 && s !== c && t.addIssue({
				code: "custom",
				path: i,
				message: `Стиль «${o.styleId}» описывает вид элементов типа «${s}», а «${e}» имеет тип «${c}». Наборы свойств не пересекаются.`
			});
		}
		let u = (n, r) => {
			if (n.kind === "seconds") return n.t > e.audio.duration && t.addIssue({
				code: "custom",
				path: r,
				message: `Время ${n.t} с выходит за длительность дорожки ${e.audio.duration} с`
			}), n.t;
			if (n.wordIndex >= c) {
				t.addIssue({
					code: "custom",
					path: r,
					message: c === 0 ? "Ссылка на слово при пустом транскрипте" : `Слово №${n.wordIndex} отсутствует, всего слов ${c}`
				});
				return;
			}
			return e.audio.words[n.wordIndex].start + n.offset;
		}, d = e.slides[0];
		if (!d) return;
		(d.at.kind !== "seconds" || d.at.t !== 0) && t.addIssue({
			code: "custom",
			path: r("slides", 0, "at"),
			message: `Сегмент «${e.id}»: первый слайд обязан стоять на нуле ({ kind: "seconds", t: 0 }). Привязка нулевого кадра к слову сделала бы начальный вид сегмента зависимым от транскрипта.`
		});
		let f = /* @__PURE__ */ new Set(), p = -Infinity;
		e.slides.forEach((n, i) => {
			f.has(n.id) && t.addIssue({
				code: "custom",
				path: r("slides", i, "id"),
				message: `Сегмент «${e.id}»: идентификатор слайда «${n.id}» повторяется`
			}), f.add(n.id);
			let a = u(n.at, r("slides", i, "at"));
			a !== void 0 && (a < p ? t.addIssue({
				code: "custom",
				path: r("slides", i, "at"),
				message: `Сегмент «${e.id}»: слайды идут не по порядку — ${a.toFixed(3)} с после ${p.toFixed(3)} с`
			}) : a === p && t.addIssue({
				code: "custom",
				path: r("slides", i, "at"),
				message: `Сегмент «${e.id}»: два слайда на одной секунде (${a.toFixed(3)}) — какой из них показывать, неизвестно`
			}), p = a);
			for (let e of Object.keys(n.states)) s.has(e) || t.addIssue({
				code: "custom",
				path: r("slides", i, "states", e),
				message: `Слайд «${n.id}» задаёт состояние элемента «${e}», которого нет в сегменте`
			});
		}), e.gates.forEach((e, t) => {
			u(e.at, r("gates", t, "at"));
		});
		let m = /* @__PURE__ */ new Map();
		e.authorSpans.forEach((n, i) => {
			let a = r("authorSpans", i);
			s.has(n.elementId) || t.addIssue({
				code: "custom",
				path: [...a, "elementId"],
				message: `Отрезок «моё» назначен элементу «${n.elementId}», которого нет в сегменте «${e.id}»`
			});
			let o = u(n.from, [...a, "from"]), c = u(n.to, [...a, "to"]);
			if (o === void 0 || c === void 0) return;
			if (c <= o) {
				t.addIssue({
					code: "custom",
					path: a,
					message: `Отрезок «моё» кончается (${c.toFixed(3)} с) не позже, чем начинается (${o.toFixed(3)} с)`
				});
				return;
			}
			let l = m.get(n.elementId) ?? -Infinity;
			o < l && t.addIssue({
				code: "custom",
				path: a,
				message: `Отрезки «моё» элемента «${n.elementId}» перекрываются или идут не по порядку: ${o.toFixed(3)} с начинается раньше, чем кончился предыдущий (${l.toFixed(3)} с)`
			}), m.set(n.elementId, c);
		});
		let h = /* @__PURE__ */ new Set();
		if (e.exit.rules.forEach((n, a) => {
			let s = r("exit", "rules", a);
			h.has(n.id) && t.addIssue({
				code: "custom",
				path: [...s, "id"],
				message: `Сегмент «${e.id}»: идентификатор правила «${n.id}» повторяется`
			}), h.add(n.id), i.has(n.goto) || t.addIssue({
				code: "custom",
				path: [...s, "goto"],
				message: `Правило выхода ведёт в несуществующий сегмент «${n.goto}»`
			}), n.when.forEach((e, n) => {
				let r = [
					...s,
					"when",
					n
				], i = o.get(e.variable);
				if (!i) {
					t.addIssue({
						code: "custom",
						path: [...r, "variable"],
						message: `Правило выхода смотрит на переменную «${e.variable}», которую не записывает ни один гейт объяснения`
					});
					return;
				}
				(e.kind === "correct" || e.kind === "wrong") && i.isFork && t.addIssue({
					code: "custom",
					path: r,
					message: `Переменная «${e.variable}» записана развилкой: верного ответа у неё нет, и вердикт «верно»/«неверно» о ней невозможен. Сравнивайте с конкретным вариантом.`
				}), (e.kind === "equals" || e.kind === "notEquals") && i.kind === "continue" && t.addIssue({
					code: "custom",
					path: r,
					message: `Переменная «${e.variable}» пишется гейтом вида continue: у него один исход, и сравнивать её значение не с чем`
				}), (e.kind === "equals" || e.kind === "notEquals") && i.kind === "choice" && !i.optionIds.includes(e.value) && t.addIssue({
					code: "custom",
					path: [...r, "value"],
					message: `Правило выхода сравнивает «${e.variable}» со значением «${e.value}», которого нет среди вариантов гейта. ` + (e.kind === "equals" ? "Эта ветка недостижима навсегда." : "Такое условие выполняется всегда и ничего не отбирает.")
				});
			});
		}), e.exit.default !== null && !i.has(e.exit.default) && t.addIssue({
			code: "custom",
			path: r("exit", "default"),
			message: `Выход по умолчанию ведёт в несуществующий сегмент «${e.exit.default}»`
		}), e.exit.rules.length > 0 && e.exit.default === null) {
			let n = e.exit.rules.every((e) => e.when.length === 1), i = n ? e.exit.rules.map((e) => e.when[0]) : [], a = new Set(i.map((e) => e.variable)), s = new Set(i.map((e) => e.kind)), c = !1;
			if (n && a.size === 1) {
				let e = [...a][0], t = o.get(e);
				if (s.has("correct") && s.has("wrong")) c = !0;
				else if (t && s.size === 1 && s.has("equals")) {
					let e = new Set(i.map((e) => e.kind === "equals" ? e.value : ""));
					c = t.optionIds.length > 0 && t.optionIds.every((t) => e.has(t));
				}
			}
			c || t.addIssue({
				code: "custom",
				path: r("exit", "default"),
				message: `Сегмент «${e.id}»: правила выхода не покрывают все исходы, а запасного выхода нет. Ответ, не подошедший ни под одно правило, привёл бы зрителя в тупик. Задайте default, либо покройте правилами все варианты одного гейта, либо возьмите оба исхода «верно» и «неверно».`
			});
		}
	});
}), To = "node-1", Eo = (e) => {
	let t = e;
	return {
		schemaVersion: 2,
		meta: t.meta,
		entry: To,
		nodes: [{
			id: To,
			title: t.meta?.title,
			audio: t.audio,
			scene: t.scene,
			edges: []
		}]
	};
}, Do = (e, t) => typeof e == "number" && Number.isFinite(e) ? e : t;
function Oo(e) {
	return !e || typeof e != "object" ? "broken" : e.kind === "seconds" ? `s:${String(e.t)}` : e.kind === "word" ? `w:${String(e.wordIndex)}:${String(e.offset)}` : "broken";
}
function ko(e, t) {
	if (!e || typeof e != "object") return;
	if (e.kind === "seconds") return typeof e.t == "number" && Number.isFinite(e.t) ? e.t : void 0;
	if (e.kind !== "word") return;
	let n = e.wordIndex;
	if (typeof n != "number" || !Number.isInteger(n)) return;
	let r = t[n];
	if (!(!r || typeof r.start != "number")) return r.start + Do(e.offset, 0);
}
function Ao(e, t, n, r) {
	if (n === "filter") {
		if (r === void 0) return;
		e.style = {
			...e.style,
			filter: String(r)
		};
		return;
	}
	let i = typeof r == "number" ? r : Number.parseFloat(String(r));
	if (Number.isFinite(i)) switch (n) {
		case "x":
			e.x = t.x + i;
			break;
		case "y":
			e.y = t.y + i;
			break;
		case "scale":
			e.width = t.width * i, e.height = t.height * i;
			break;
		case "scaleX":
			e.width = t.width * i;
			break;
		case "scaleY":
			e.height = t.height * i;
			break;
		case "rotate":
			e.rotation = t.rotation + i;
			break;
		case "opacity":
			i === 0 ? (e.visible = !1, e.opacity = 1) : (e.visible = !0, e.opacity = Math.min(1, Math.max(0, i)));
			break;
		default: break;
	}
}
var jo = (e) => Object.fromEntries(Object.entries(e).map(([e, t]) => [e, {
	...t,
	style: { ...t.style }
}]));
function Mo(e, t) {
	let n = e.scene?.elements ?? [], r = e.scene?.cues ?? [], i = e.audio?.words ?? [], a = Do(e.audio?.duration, 0), o = {};
	for (let e of n) {
		let t = String(e.id), n = { ...e.style ?? {} }, r = 1, i = !0;
		if ("opacity" in n) {
			let e = Number(n.opacity);
			delete n.opacity, Number.isFinite(e) && (e === 0 ? i = !1 : r = Math.min(1, Math.max(0, e)));
		}
		o[t] = {
			x: Do(e.x, 0),
			y: Do(e.y, 0),
			width: Do(e.width, 0),
			height: Do(e.height, 0),
			rotation: Do(e.rotation, 0),
			zIndex: Do(e.zIndex, 0),
			opacity: r,
			visible: i,
			style: n
		};
	}
	let s = /* @__PURE__ */ new Map(), c = (e, t, n) => {
		let r = s.get(e);
		if (r) return r;
		let i = {
			key: e,
			seconds: t,
			at: n,
			starts: [],
			ends: []
		};
		return s.set(e, i), i;
	};
	c("s:0", 0, {
		kind: "seconds",
		t: 0
	});
	for (let e of r) {
		let t = Oo(e.at), n = ko(e.at, i);
		if (c(t, n, e.at).starts.push(e), n === void 0) continue;
		let r = Do(e.animation?.duration, 0), o = Math.min(n + r / 1e3, a);
		o <= n || c(`s:${o}`, o, {
			kind: "seconds",
			t: o
		}).ends.push(e);
	}
	let l = [...s.values()].sort((e, t) => (e.seconds ?? Infinity) - (t.seconds ?? Infinity)), u = jo(o), d = /* @__PURE__ */ new Map();
	for (let e of r) {
		if (e.animation?.from === void 0) continue;
		let t = `${String(e.targetId)} ${String(e.animation.property)}`, n = ko(e.at, i) ?? Infinity, r = d.get(t);
		(!r || n < r.seconds) && d.set(t, {
			seconds: n,
			cue: e
		});
	}
	for (let { cue: e } of d.values()) {
		let t = String(e.targetId), n = u[t], r = o[t];
		n && r && Ao(n, r, e.animation?.property, e.animation?.from);
	}
	let f = [];
	return l.forEach((e, n) => {
		for (let t of e.ends) {
			let e = String(t.targetId), n = u[e], r = o[e];
			n && r && Ao(n, r, t.animation?.property, t.animation?.to);
		}
		for (let t of e.starts) {
			let e = String(t.targetId), n = u[e], r = o[e];
			if (!n || !r) continue;
			let i = t.animation;
			i?.from !== void 0 && Ao(n, r, i.property, i.from);
		}
		f.push({
			id: `${t}-slide-${n + 1}`,
			at: e.at,
			transition: "morph",
			states: jo(u)
		}), u = jo(u);
	}), f;
}
var No = Object.freeze({
	retry: "retry",
	reveal: "inline-explain",
	continue: "continue"
}), Po = Object.freeze({
	1: Eo,
	2: (e) => {
		let t = e, n = Array.isArray(t.nodes) ? t.nodes : [], r = /* @__PURE__ */ new Set(), i = (e, t) => {
			let n = t;
			if (!r.has(n)) return r.add(n), n;
			let i = `${e}-${t}`;
			return r.add(i), i;
		}, a = n.map((e) => {
			let t = String(e.id), n = e.scene?.gates ?? [], r = /* @__PURE__ */ new Map(), a = n.map((e) => {
				let n = String(e.id), a = i(t, n);
				r.set(n, a);
				let o = No[String(e.onWrong)] ?? "retry";
				return {
					id: e.id,
					at: e.at,
					config: e.config,
					onWrong: o,
					maxAttempts: e.maxAttempts ?? null,
					recordAs: a
				};
			}), o = Array.isArray(e.edges) ? e.edges : [], s = [], c = null;
			return o.forEach((e, n) => {
				let i = e.when, a = i?.kind;
				if (a === "end") {
					c = e.to;
					return;
				}
				let o = String(i?.gateId), l = r.get(o) ?? o, u = a === "option" ? {
					kind: "equals",
					variable: l,
					value: String(i?.optionId)
				} : a === "correct" ? {
					kind: "correct",
					variable: l
				} : a === "wrong" ? {
					kind: "wrong",
					variable: l
				} : void 0;
				u && s.push({
					id: e.id ?? `${t}-rule-${n + 1}`,
					when: u,
					goto: e.to
				});
			}), {
				id: e.id,
				title: e.title,
				audio: e.audio,
				elements: (e.scene?.elements ?? []).map((e) => ({
					id: e.id,
					type: e.type === "group" ? "shape" : e.type,
					content: e.content ?? ""
				})),
				slides: Mo(e, t),
				gates: a,
				exit: {
					rules: s,
					default: c
				}
			};
		});
		return {
			schemaVersion: 3,
			meta: t.meta,
			entry: t.entry,
			segments: a
		};
	},
	3: (e) => {
		let t = e, n = Array.isArray(t.segments) ? t.segments.map((e) => {
			if (typeof e != "object" || !e) return e;
			let t = e.audio;
			return typeof t != "object" || !t || "offset" in t ? e : {
				...e,
				audio: {
					...t,
					offset: 0
				}
			};
		}) : t.segments;
		return {
			schemaVersion: 4,
			meta: t.meta,
			entry: t.entry,
			segments: n
		};
	},
	4: (e) => {
		let t = e, n = Array.isArray(t.segments) ? t.segments.map((e) => {
			if (typeof e != "object" || !e) return e;
			let t = e.exit;
			if (typeof t != "object" || !t) return e;
			let n = t.rules;
			return Array.isArray(n) ? {
				...e,
				exit: {
					...t,
					rules: n.map((e) => {
						if (typeof e != "object" || !e) return e;
						let t = e.when;
						return t === void 0 || Array.isArray(t) ? e : {
							...e,
							when: [t]
						};
					})
				}
			} : e;
		}) : t.segments;
		return {
			schemaVersion: 5,
			meta: t.meta,
			entry: t.entry,
			segments: n
		};
	},
	5: (e) => {
		let t = e;
		return {
			schemaVersion: 6,
			meta: t.meta,
			entry: t.entry,
			segments: t.segments
		};
	},
	6: (e) => {
		let t = e;
		return {
			schemaVersion: 7,
			meta: t.meta,
			entry: t.entry,
			segments: t.segments
		};
	},
	7: (e) => {
		let t = e;
		return {
			schemaVersion: 8,
			meta: t.meta,
			entry: t.entry,
			segments: t.segments
		};
	},
	8: (e) => {
		let t = e;
		return {
			schemaVersion: 9,
			meta: t.meta,
			entry: t.entry,
			segments: t.segments
		};
	},
	9: (e) => {
		let t = e;
		return {
			schemaVersion: 10,
			meta: t.meta,
			entry: t.entry,
			segments: t.segments
		};
	},
	10: (e) => {
		let t = e;
		return {
			schemaVersion: 11,
			meta: t.meta,
			entry: t.entry,
			segments: t.segments
		};
	},
	11: (e) => {
		let t = e;
		return {
			schemaVersion: 12,
			meta: t.meta,
			entry: t.entry,
			segments: t.segments,
			styles: []
		};
	},
	12: (e) => {
		let t = e;
		return {
			schemaVersion: 13,
			meta: t.meta,
			entry: t.entry,
			segments: t.segments,
			styles: t.styles
		};
	},
	13: (e) => {
		let t = e;
		return {
			schemaVersion: 14,
			meta: t.meta,
			entry: t.entry,
			segments: t.segments,
			styles: t.styles
		};
	},
	14: (e) => {
		let t = e, n = t.segments.map((e) => {
			let t = new Set((e.elements ?? []).map((e) => e.id)), n = (e.gates ?? []).map((e) => {
				let n = e.config;
				return n?.kind !== "choice" || !n.options ? e : {
					...e,
					config: {
						...n,
						options: n.options.map((e) => t.has(e.id) ? {
							...e,
							elementId: e.id
						} : e)
					}
				};
			});
			return {
				...e,
				gates: n
			};
		});
		return {
			schemaVersion: 15,
			meta: t.meta,
			entry: t.entry,
			segments: n,
			styles: t.styles
		};
	},
	15: (e) => ({
		...e,
		schemaVersion: 16
	})
}), Fo = class extends Error {
	found;
	constructor(e, t) {
		super(e), this.found = t, this.name = "SchemaVersionError";
	}
};
function Io(e) {
	if (typeof e != "object" || !e) throw new Fo("Проект должен быть объектом", e);
	let t = e.schemaVersion;
	if (typeof t != "number" || !Number.isInteger(t) || t < 1) throw new Fo(`Некорректная schemaVersion: ${JSON.stringify(t)}`, t);
	return t;
}
function Lo(e) {
	let t = Io(e);
	if (t > 16) throw new Fo(`Проект сохранён в версии схемы ${t}, а эта сборка понимает только 16. Обновите приложение.`, t);
	let n = e;
	for (; t < 16;) {
		let e = Po[t];
		if (!e) throw new Fo(`Нет миграции с версии ${t} на ${t + 1}. Каждая версия схемы обязана иметь миграцию (инвариант №7).`, t);
		n = e(n), t = Io(n);
	}
	return n;
}
//#endregion
//#region packages/core/src/time.ts
function Ro(e) {
	return e.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]/gu, "");
}
var zo = class extends Error {
	ref;
	constructor(e, t) {
		super(e), this.ref = t, this.name = "TimeRefError";
	}
};
function Bo(e, t) {
	if (e.kind === "seconds") return e.t;
	let n = t[e.wordIndex];
	if (!n) throw new zo(t.length === 0 ? "Ссылка на слово, но транскрипт пуст" : `Слово №${e.wordIndex} отсутствует, всего слов ${t.length}`, e);
	if (e.kind === "word" && Ro(n.text) !== e.anchor.text) throw new zo(`Слово №${e.wordIndex} теперь «${n.text}», а метка ставилась на «${e.anchor.text}». Требуется перепривязка.`, e);
	return Math.max(0, n.start + e.offset);
}
//#endregion
//#region packages/core/src/graph.ts
function Vo(e, t) {
	let n = e.segments.find((e) => e.id === t);
	if (!n) throw Error(`Сегмента «${t}» нет в объяснении`);
	return n;
}
function Ho(e, t) {
	let n = t[e.variable];
	if (!n) return !1;
	switch (e.kind) {
		case "equals": return n.value === e.value;
		case "notEquals": return n.value !== e.value;
		case "correct": return n.correct;
		case "wrong": return !n.correct;
		case "compare": return Uo(e.op, n.value, e.value);
		default: throw Error(`Неизвестный вид условия: ${JSON.stringify(e)}`);
	}
}
function Uo(e, t, n) {
	if (t.trim() === "") return !1;
	let r = Number(t);
	if (!Number.isFinite(r)) return !1;
	switch (e) {
		case "gt": return r > n;
		case "gte": return r >= n;
		case "lt": return r < n;
		case "lte": return r <= n;
		default: throw Error(`Неизвестный оператор сравнения: ${JSON.stringify(e)}`);
	}
}
function Wo(e, t) {
	return e.every((e) => Ho(e, t));
}
function Go(e, t) {
	for (let n of e.exit.rules) if (Wo(n.when, t)) return {
		goto: n.goto,
		rule: n
	};
	return e.exit.default === null ? null : {
		goto: e.exit.default,
		rule: null
	};
}
function Ko(e, t) {
	let n = /* @__PURE__ */ new Set(), r = t, i = 0;
	for (;;) {
		if (n.has(r)) return null;
		n.add(r);
		let t = qo(Vo(e, r));
		if (t.length === 0) return i;
		if (t.length > 1) return null;
		r = t[0], i += 1;
	}
}
function qo(e) {
	let t = e.exit.rules.map((e) => e.goto);
	return e.exit.default !== null && t.push(e.exit.default), [...new Set(t)];
}
//#endregion
//#region packages/core/src/load.ts
var Jo = class extends Error {
	issues;
	constructor(e, t) {
		super(e), this.issues = t, this.name = "ProjectLoadError";
	}
};
function Yo(e) {
	let t = Lo(e), n = wo.safeParse(t);
	if (!n.success) {
		let e = n.error.issues.map((e) => `${e.path.join(".") || "<корень>"}: ${e.message}`);
		throw new Jo(`Проект не прошёл валидацию (${e.length} проблем):\n  ${e.join("\n  ")}`, e);
	}
	return n.data;
}
//#endregion
//#region packages/player/src/assets.ts
var Xo = "player-assets", Zo = 1, Qo = "audio";
function $o() {
	return new Promise((e, t) => {
		let n = indexedDB.open(Xo, Zo);
		n.onupgradeneeded = () => {
			let e = n.result;
			e.objectStoreNames.contains(Qo) || e.createObjectStore(Qo);
		}, n.onsuccess = () => {
			e(n.result);
		}, n.onerror = () => {
			t(n.error ?? /* @__PURE__ */ Error(`Не удалось открыть базу ${Xo}`));
		};
	});
}
async function es(e) {
	let t = await crypto.subtle.digest("SHA-256", e);
	return `aud-${Array.from(new Uint8Array(t), (e) => e.toString(16).padStart(2, "0")).join("")}`;
}
async function ts(e) {
	let t = await es(e.bytes), n = await $o();
	try {
		await new Promise((r, i) => {
			let a = n.transaction(Qo, "readwrite");
			a.objectStore(Qo).put({
				...e,
				addedAt: Date.now()
			}, t), a.oncomplete = () => {
				r();
			}, a.onerror = () => {
				i(a.error ?? /* @__PURE__ */ Error("Не удалось сохранить озвучку"));
			}, a.onabort = () => {
				i(a.error ?? /* @__PURE__ */ Error("Запись озвучки отменена браузером"));
			};
		});
	} finally {
		n.close();
	}
	return t;
}
async function ns(e) {
	let t = await $o();
	try {
		return await new Promise((n, r) => {
			let i = t.transaction(Qo, "readonly").objectStore(Qo).get(e);
			i.onsuccess = () => {
				n(i.result ?? null);
			}, i.onerror = () => {
				r(i.error ?? /* @__PURE__ */ Error(`Не удалось прочитать озвучку ${e}`));
			};
		});
	} finally {
		t.close();
	}
}
async function rs(e) {
	if (e.kind === "url") return e.url;
	if (e.kind === "silent") throw Error("У немого сегмента нет адреса озвучки. Часы для него строит clockFor, минуя разрешение адреса; сюда попали в обход этой ветки.");
	let t = await ns(e.fileId);
	if (!t) throw Error(`Озвучка ${e.fileId} не найдена в хранилище этого браузера. Проект ссылается на файл, который был загружен в другом браузере или удалён вместе с данными сайта.`);
	return URL.createObjectURL(new Blob([t.bytes], { type: t.type || "audio/mpeg" }));
}
function is(e, t) {
	e.kind === "file" && URL.revokeObjectURL(t);
}
//#endregion
//#region packages/player/src/clock.ts
var as = 1, os = 8, ss = .02;
async function cs(e, t) {
	let n = await fetch(t);
	if (!n.ok) throw Error(`Не удалось загрузить дорожку ${t}: HTTP ${n.status}`);
	let r = await n.arrayBuffer(), i = performance.now(), a = await e.decodeAudioData(r);
	return {
		buffer: a,
		bytesDownloaded: r.byteLength,
		decodeMs: performance.now() - i,
		decodedBytes: a.length * a.numberOfChannels * 4
	};
}
function ls(e) {
	if (e.kind === "url") return `url:${e.url}`;
	if (e.kind === "file") return `file:${e.fileId}`;
	throw Error("У немого сегмента нет дорожки, а значит и ключа кэша");
}
var us = class {
	#e;
	#t;
	#n;
	#r;
	#i = null;
	#a = null;
	#o = null;
	constructor(e, t) {
		this.#e = e, this.#t = t, this.#n = e.createGain(), this.#n.connect(e.destination), this.#r = ps(e);
	}
	get context() {
		return this.#e;
	}
	get duration() {
		return this.#t.duration;
	}
	get scheduleEnd() {
		let e = this.#a;
		return e ? e.ctxTime + (this.#t.duration - e.mediaTime) : null;
	}
	get scheduleNow() {
		return this.#e.currentTime;
	}
	async wake() {
		this.#e.state === "suspended" && await this.#e.resume();
	}
	get isFrozen() {
		return this.#o !== null;
	}
	get isRunning() {
		return this.#i !== null && this.#o === null;
	}
	get diagnostics() {
		return {
			usesOutputTimestamp: this.#r,
			outputLatencyMs: this.#e.outputLatency * 1e3,
			sampleRate: this.#e.sampleRate
		};
	}
	connectTap(e) {
		this.#n.connect(e);
	}
	get position() {
		if (this.#o !== null) return this.#o;
		let e = this.#a;
		if (!e) return 0;
		let t = e.mediaTime + (this.#s() - e.ctxTime);
		return Math.min(Math.max(t, e.mediaTime), this.#t.duration);
	}
	#s() {
		return this.#r ? this.#e.getOutputTimestamp().contextTime ?? 0 : this.#e.currentTime - (this.#e.baseLatency + this.#e.outputLatency);
	}
	start(e = 0, t = {}) {
		if (this.#i) throw Error("Источник уже запущен, сначала stop()");
		if (!(e >= 0 && e <= this.#t.duration)) throw RangeError(`Позиция ${e} вне дорожки [0, ${this.#t.duration}]`);
		let n = t.leadTime ?? ss, r = t.rampMs ?? os, i = this.#e.createBufferSource();
		i.buffer = this.#t, i.connect(this.#n);
		let a = this.#e.currentTime + n;
		return this.#n.gain.cancelScheduledValues(a), this.#n.gain.setValueAtTime(0, a), this.#n.gain.linearRampToValueAtTime(1, a + r / 1e3), i.start(a, e), this.#i = i, this.#a = {
			ctxTime: a,
			mediaTime: e
		}, this.#o = null, a;
	}
	async freezeAt(e, t = {}) {
		let n = this.#i, r = this.#a;
		if (!n || !r) throw Error("Нечего останавливать: источник не запущен");
		let i = (t.rampMs ?? os) / 1e3, a = this.#e.currentTime, o = r.ctxTime + (e - r.mediaTime), s = Math.max(a + .001, o);
		this.#n.gain.cancelScheduledValues(a), this.#n.gain.setValueAtTime(this.#n.gain.value, Math.max(a, s - i)), this.#n.gain.linearRampToValueAtTime(0, s), this.#o = e, n.stop(s), n.disconnect(), this.#i = null, await this.#e.suspend();
	}
	holdBeforeStart(e) {
		if (this.#i) throw Error("Источник уже запущен: остановка до начала здесь неуместна");
		if (!(e >= 0)) throw RangeError(`Позиция паузы до начала должна быть неотрицательной, получено ${e}`);
		this.#o = e;
	}
	async resumeFromFreeze() {
		if (this.#o === null) throw Error("Часы не в состоянии паузы");
		let e = this.#o;
		await this.#e.resume(), this.#o = null, this.start(e);
	}
	seek(e) {
		if (!(e >= 0 && e <= this.#t.duration)) throw RangeError(`Позиция ${e} вне дорожки [0, ${this.#t.duration}]`);
		let t = this.isRunning;
		if (this.#i &&= (this.#i.stop(), this.#i.disconnect(), null), t) {
			this.#a = null, this.#o = null, this.start(e);
			return;
		}
		this.#a = null, this.#o = e;
	}
	stop() {
		this.#i &&= (this.#i.stop(), this.#i.disconnect(), null), this.#a = null, this.#o = null;
	}
}, ds = class {
	#e;
	#t;
	#n = null;
	#r = null;
	#i = !1;
	constructor(e, t) {
		if (!(t > 0 && Number.isFinite(t))) throw RangeError(`Длительность немого сегмента должна быть положительной, получено ${t}`);
		this.#e = e, this.#t = t;
	}
	get context() {
		return this.#e;
	}
	get duration() {
		return this.#t;
	}
	get scheduleNow() {
		return this.#e.currentTime;
	}
	get scheduleEnd() {
		let e = this.#n;
		return e ? e.ctxTime + (this.#t - e.mediaTime) : null;
	}
	get isFrozen() {
		return this.#r !== null;
	}
	get isRunning() {
		return this.#i && this.#r === null;
	}
	async wake() {
		this.#e.state === "suspended" && await this.#e.resume();
	}
	get position() {
		if (this.#r !== null) return this.#r;
		let e = this.#n;
		if (!e) return 0;
		let t = e.mediaTime + (this.#e.currentTime - e.ctxTime);
		return Math.min(Math.max(t, e.mediaTime), this.#t);
	}
	start(e = 0, t = {}) {
		if (this.#i) throw Error("Часы уже запущены, сначала stop()");
		if (!(e >= 0 && e <= this.#t)) throw RangeError(`Позиция ${e} вне сегмента [0, ${this.#t}]`);
		let n = this.#e.currentTime + (t.leadTime ?? ss);
		return this.#i = !0, this.#n = {
			ctxTime: n,
			mediaTime: e
		}, this.#r = null, n;
	}
	async freezeAt(e) {
		if (!this.#i || !this.#n) throw Error("Нечего останавливать: часы не запущены");
		this.#r = e, this.#i = !1, await this.#e.suspend();
	}
	holdBeforeStart(e) {
		if (this.#i) throw Error("Часы уже запущены: остановка до начала здесь неуместна");
		if (!(e >= 0)) throw RangeError(`Позиция паузы до начала должна быть неотрицательной, получено ${e}`);
		this.#r = e;
	}
	async resumeFromFreeze() {
		if (this.#r === null) throw Error("Часы не в состоянии паузы");
		let e = this.#r;
		await this.#e.resume(), this.#r = null, this.start(e);
	}
	seek(e) {
		if (!(e >= 0 && e <= this.#t)) throw RangeError(`Позиция ${e} вне сегмента [0, ${this.#t}]`);
		let t = this.isRunning;
		if (this.#i = !1, this.#n = null, this.#r = null, t) {
			this.start(e);
			return;
		}
		this.#r = e;
	}
	stop() {
		this.#i = !1, this.#n = null, this.#r = null;
	}
}, fs = class {
	#e = null;
	#t = /* @__PURE__ */ new Map();
	#n = /* @__PURE__ */ new Map();
	#r() {
		return this.#e ??= new AudioContext(), this.#e;
	}
	async clockFor(e) {
		let t = this.#r();
		if (e.kind === "silent") return new ds(t, e.seconds);
		let n = ls(e), r = this.#t.get(n);
		if (r) return new us(t, r);
		let i = await rs(e);
		try {
			let e = await cs(t, i);
			return this.#t.set(n, e.buffer), new us(t, e.buffer);
		} finally {
			is(e, i);
		}
	}
	clockIfReady(e) {
		if (e.kind === "silent") return new ds(this.#r(), e.seconds);
		let t = this.#t.get(ls(e));
		return t ? new us(this.#r(), t) : null;
	}
	warm(e) {
		if (e.kind === "silent") return;
		let t = ls(e);
		if (this.#t.has(t) || this.#n.has(t)) return;
		let n = this.clockFor(e).catch(() => void 0).finally(() => {
			this.#n.delete(t);
		});
		this.#n.set(t, n);
	}
	async close() {
		let e = this.#e;
		this.#e = null, this.#t.clear(), this.#n.clear(), e && await e.close();
	}
};
function ps(e) {
	let t = e.getOutputTimestamp?.();
	if (!t || typeof t.contextTime != "number") return console.warn("[clock] getOutputTimestamp недоступен, беру запасную формулу"), !1;
	let n = Math.abs(t.contextTime - e.currentTime);
	return n < as ? !0 : (console.warn(`[clock] getOutputTimestamp невменяем: contextTime=${t.contextTime}, currentTime=${e.currentTime}, расхождение ${n.toFixed(3)} с. Беру запасную формулу.`), !1);
}
//#endregion
//#region node_modules/.pnpm/animejs@4.5.0/node_modules/animejs/dist/modules/core/consts.js
var ms = typeof window < "u", hs = ms ? window : null, gs = ms ? document : null, V = {
	OBJECT: 0,
	ATTRIBUTE: 1,
	CSS: 2,
	TRANSFORM: 3,
	CSS_VAR: 4
}, H = {
	NUMBER: 0,
	UNIT: 1,
	COLOR: 2,
	COMPLEX: 3
}, _s = {
	NONE: 0,
	AUTO: 1,
	FORCE: 2
}, U = {
	replace: 0,
	none: 1,
	blend: 2
}, vs = Symbol(), ys = Symbol(), bs = Symbol(), xs = Symbol(), Ss = Symbol(), W = 1e-11, Cs = 0xe8d4a51000, ws = 1e3, Ts = [], Es = /*#__PURE__*/ (() => {
	let e = /* @__PURE__ */ new Map();
	return e.set("x", "translateX"), e.set("y", "translateY"), e.set("z", "translateZ"), e;
})(), Ds = [
	"perspective",
	"translateX",
	"translateY",
	"translateZ",
	"rotate",
	"rotateX",
	"rotateY",
	"rotateZ",
	"scale",
	"scaleX",
	"scaleY",
	"scaleZ",
	"skew",
	"skewX",
	"skewY"
], Os = /*#__PURE__*/ Ds.reduce((e, t) => ({
	...e,
	[t]: t + "("
}), {}), ks = () => {}, As = (e) => e, js = /\)\s*[-.\d]/, Ms = /(^#([\da-f]{3}){1,2}$)|(^#([\da-f]{4}){1,2}$)/i, Ns = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i, Ps = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(-?\d+|-?\d*.\d+)\s*\)/i, Fs = /hsl\(\s*(-?\d+|-?\d*.\d+)\s*,\s*(-?\d+|-?\d*.\d+)%\s*,\s*(-?\d+|-?\d*.\d+)%\s*\)/i, Is = /hsla\(\s*(-?\d+|-?\d*.\d+)\s*,\s*(-?\d+|-?\d*.\d+)%\s*,\s*(-?\d+|-?\d*.\d+)%\s*,\s*(-?\d+|-?\d*.\d+)\s*\)/i, Ls = /[-+]?\d*\.?\d+(?:e[-+]?\d)?/gi, Rs = /^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)([a-z]+|%)$/i, zs = /([a-z])([A-Z])/g, Bs = /(\*=|\+=|-=)/, Vs = /var\(\s*(--[\w-]+)(?:\s*,\s*([^)]+))?\s*\)/, Hs = {
	id: null,
	keyframes: null,
	playbackEase: null,
	playbackRate: 1,
	frameRate: 240,
	loop: 0,
	reversed: !1,
	alternate: !1,
	autoplay: !0,
	persist: !1,
	duration: ws,
	delay: 0,
	loopDelay: 0,
	ease: "out(2)",
	composition: U.replace,
	modifier: As,
	onBegin: ks,
	onBeforeUpdate: ks,
	onUpdate: ks,
	onLoop: ks,
	onPause: ks,
	onComplete: ks,
	onRender: ks
}, Us = {
	current: null,
	root: gs
}, G = {
	defaults: Hs,
	precision: 4,
	timeScale: 1,
	tickThreshold: 200,
	editor: null
}, Ws = {
	version: "4.5.0",
	engine: null
};
ms && (hs.AnimeJS ||= [], hs.AnimeJS.push(Ws));
//#endregion
//#region node_modules/.pnpm/animejs@4.5.0/node_modules/animejs/dist/modules/core/helpers.js
var Gs = (e) => e.replace(zs, "$1-$2").toLowerCase(), Ks = (e, t) => e.indexOf(t) === 0, qs = Date.now, Js = Array.isArray, Ys = (e) => e && e.constructor === Object, Xs = (e) => typeof e == "number" && !isNaN(e), Zs = (e) => typeof e == "string", Qs = (e) => typeof e == "function", K = (e) => e === void 0, $s = (e) => K(e) || e === null, ec = (e) => ms && e instanceof SVGElement, tc = (e) => Ms.test(e), nc = (e) => Ks(e, "rgb"), rc = (e) => Ks(e, "hsl"), ic = (e) => tc(e) || (nc(e) || rc(e)) && (e[e.length - 1] === ")" || !js.test(e)), ac = (e) => !G.defaults.hasOwnProperty(e), oc = [
	"opacity",
	"rotate",
	"overflow",
	"color"
], sc = (e, t) => {
	if (oc.includes(t)) return !1;
	if (e.getAttribute(t) || t in e) {
		if (t === "scale") {
			let t = e.parentNode;
			return t && t.tagName === "filter";
		}
		return !0;
	}
}, cc = Math.pow, lc = Math.sqrt, uc = Math.sin, dc = Math.cos, fc = Math.floor, pc = Math.asin, mc = Math.PI, hc = Math.round, gc = (e, t, n) => e < t ? t : e > n ? n : e, q = (e, t) => {
	if (t < 0) return e;
	if (!t) return hc(e);
	let n = 10 ** t;
	return hc(e * n) / n;
}, _c = (e, t, n) => n === 1 ? t : n === 0 ? e : e + (t - e) * n, vc = (e) => e === Infinity ? Cs : e === -Infinity ? -Cs : e, yc = (e) => e <= 1e-11 ? W : vc(q(e, 11)), J = (e) => Js(e) ? [...e] : e, bc = (e, t) => {
	let n = { ...e };
	for (let r in t) {
		let i = e[r];
		n[r] = K(i) ? t[r] : i;
	}
	return n;
}, Y = (e, t, n, r = "_prev", i = "_next") => {
	let a = e._head, o = i;
	for (n && (a = e._tail, o = r); a;) {
		let e = a[o];
		t(a), a = e;
	}
}, xc = (e, t, n = "_prev", r = "_next") => {
	let i = t[n], a = t[r];
	i ? i[r] = a : e._head = a, a ? a[n] = i : e._tail = i, t[n] = null, t[r] = null;
}, Sc = (e, t, n, r = "_prev", i = "_next") => {
	let a = e._tail;
	for (; a && n && n(a, t);) a = a[r];
	let o = a ? a[i] : e._head;
	a ? a[i] = t : e._head = t, o ? o[r] = t : e._tail = t, t[r] = a, t[i] = o;
}, Cc = (e, t, n) => {
	let r = e.style.transform;
	if (r) {
		let i = e[xs], a = 0, o = r.length, s;
		for (; a < o;) {
			for (; a < o && r.charCodeAt(a) === 32;) a++;
			if (a >= o) break;
			let e = a;
			for (; a < o && r.charCodeAt(a) !== 40;) a++;
			if (a >= o) break;
			let t = r.substring(e, a), n = 1, c = a + 1, l = -1, u = -1;
			for (a++; a < o && n > 0;) {
				let e = r.charCodeAt(a);
				e === 40 ? n++ : e === 41 ? n-- : e === 44 && n === 1 && (l === -1 ? l = a : u === -1 && (u = a)), a++;
			}
			let d = a - 1;
			t === "translate" || t === "translate3d" ? (l === -1 ? i.translateX = r.substring(c, d).trim() : (i.translateX = r.substring(c, l).trim(), u === -1 ? i.translateY = r.substring(l + 1, d).trim() : (i.translateY = r.substring(l + 1, u).trim(), i.translateZ = r.substring(u + 1, d).trim())), s = r.substring(c, d)) : t === "scale" || t === "scale3d" ? l === -1 ? i.scale = r.substring(c, d).trim() : (i.scaleX = r.substring(c, l).trim(), u === -1 ? i.scaleY = r.substring(l + 1, d).trim() : (i.scaleY = r.substring(l + 1, u).trim(), i.scaleZ = r.substring(u + 1, d).trim())) : i[t] = r.substring(c, d);
		}
		if (t === "translate3d" && s) return n && (n[t] = s), s;
		let c = i[t];
		if (!K(c)) return n && (n[t] = c), c;
	}
	return t === "translate3d" ? "0px, 0px, 0px" : t === "rotate3d" ? "0, 0, 0, 0deg" : Ks(t, "scale") ? "1" : Ks(t, "rotate") || Ks(t, "skew") ? "0deg" : "0px";
}, wc = (e) => {
	let t = "";
	for (let n = 0, r = Ds.length; n < r; n++) {
		let r = Ds[n], i = e[r];
		if (i !== void 0) {
			if (r === "translateX") {
				let r = e.translateY;
				if (r !== void 0) {
					let a = e.translateZ;
					a === void 0 ? (t += `translate(${i},${r}) `, n += 1) : (t += `translate3d(${i},${r},${a}) `, n += 2);
					continue;
				}
			}
			if (r === "scaleX" && e.scale === void 0) {
				let r = e.scaleY;
				if (r !== void 0) {
					let a = e.scaleZ;
					a === void 0 ? (t += `scale(${i},${r}) `, n += 1) : (t += `scale3d(${i},${r},${a}) `, n += 2);
					continue;
				}
			}
			t += `${Os[r]}${i}) `;
		}
		r === "rotateZ" && e.rotate3d !== void 0 && (t += `rotate3d(${e.rotate3d}) `);
	}
	return e.matrix !== void 0 && (t += `matrix(${e.matrix}) `), e.matrix3d !== void 0 && (t += `matrix3d(${e.matrix3d}) `), t;
}, Tc = [];
function Ec(e, t) {
	if (!e) return null;
	let n = Tc.length;
	outer: for (let r = 0; r < n; r++) {
		let n = Tc[r];
		if (n.detect && !n.detect(e)) continue;
		let i = n.targetAdapters;
		for (let n = 0, r = i.length; n < r; n++) {
			let r = i[n];
			if (r.detect(e)) {
				let n = r.props[t];
				if (n && (!n.gate || n.gate(e))) return n;
				break outer;
			}
		}
	}
	for (let r = 0; r < n; r++) {
		let n = Tc[r];
		if (n.detect && !n.detect(e)) continue;
		let i = n.propertyResolvers;
		for (let n = 0, r = i.length; n < r; n++) {
			let r = i[n](e, t);
			if (r) return r;
		}
	}
	return null;
}
//#endregion
//#region node_modules/.pnpm/animejs@4.5.0/node_modules/animejs/dist/modules/core/colors.js
var Dc = (e) => {
	let t = Ns.exec(e) || Ps.exec(e), n = K(t[4]) ? 1 : +t[4];
	return [
		+t[1],
		+t[2],
		+t[3],
		n
	];
}, Oc = (e) => {
	let t = e.length, n = t === 4 || t === 5;
	return [
		+("0x" + e[1] + e[n ? 1 : 2]),
		+("0x" + e[n ? 2 : 3] + e[n ? 2 : 4]),
		+("0x" + e[n ? 3 : 5] + e[n ? 3 : 6]),
		t === 5 || t === 9 ? +(("0x" + e[n ? 4 : 7] + e[n ? 4 : 8]) / 255).toFixed(3) : 1
	];
}, kc = (e, t, n) => (n < 0 && (n += 1), n > 1 && --n, n < 1 / 6 ? e + (t - e) * 6 * n : n < 1 / 2 ? t : n < 2 / 3 ? e + (t - e) * (2 / 3 - n) * 6 : e), Ac = (e) => {
	let t = Fs.exec(e) || Is.exec(e), n = t[1] / 360, r = t[2] / 100, i = t[3] / 100, a = K(t[4]) ? 1 : +t[4], o, s, c;
	if (r === 0) o = s = c = i;
	else {
		let e = i < .5 ? i * (1 + r) : i + r - i * r, t = 2 * i - e;
		o = q(kc(t, e, n + 1 / 3) * 255, 0), s = q(kc(t, e, n) * 255, 0), c = q(kc(t, e, n - 1 / 3) * 255, 0);
	}
	return [
		o,
		s,
		c,
		a
	];
}, jc = (e) => nc(e) ? Dc(e) : tc(e) ? Oc(e) : rc(e) ? Ac(e) : [
	0,
	0,
	0,
	1
], X = (e, t) => K(e) ? t : e, Mc = (e, t) => {
	let n = e.match(Vs), r = t[ys] ? t : document.documentElement, i = getComputedStyle(r)?.getPropertyValue(n[1]);
	return (!i || i.trim() === "") && n[2] && (i = n[2].trim()), i || 0;
}, Nc = (e, t, n, r, i, a) => {
	if (Qs(e)) {
		if (!i) {
			let i = e(t, n, r, a);
			return isNaN(+i) ? i || 0 : +i;
		}
		let o = () => {
			let i = e(t, n, r, a);
			return isNaN(+i) ? i || 0 : +i;
		};
		return i.func = o, o();
	}
	if (Zs(e) && Ks(e, "var(")) {
		if (!i) return Mc(e, t);
		let n = () => Mc(e, t);
		return i.func = n, n();
	}
	return e;
}, Pc = (e, t) => e[ys] ? e[bs] && sc(e, t) ? V.ATTRIBUTE : Ds.includes(t) || Es.get(t) ? V.TRANSFORM : Ks(t, "--") ? V.CSS_VAR : t in e.style ? V.CSS : t in e ? V.OBJECT : V.ATTRIBUTE : V.OBJECT, Fc = (e, t, n) => {
	let r = e.style[t];
	r && n && (n[t] = r);
	let i = r || getComputedStyle(e[Ss] || e).getPropertyValue(t);
	return i === "auto" ? "0" : i;
}, Ic = (e, t, n, r) => {
	let i = K(n) ? Pc(e, t) : n, a = Ec(e, t);
	if (a) {
		let n = a.get(e);
		return n && r && (r[t] = n), n ?? 0;
	}
	if (i === V.OBJECT) {
		let n = e[t];
		return n && r && (r[t] = n), n || 0;
	}
	if (i === V.ATTRIBUTE) {
		let n = e.getAttribute(t);
		return n && r && (r[t] = n), n;
	}
	return i === V.TRANSFORM ? Cc(e, t, r) : i === V.CSS_VAR ? Fc(e, t, r).trimStart() : Fc(e, t, r);
}, Lc = (e, t, n) => n === "-" ? e - t : n === "+" ? e + t : e * t, Rc = () => ({
	t: H.NUMBER,
	n: 0,
	u: null,
	o: null,
	d: null,
	s: null
}), zc = (e, t) => {
	if (t.t = H.NUMBER, t.n = 0, t.u = null, t.o = null, t.d = null, t.s = null, !e) return t;
	let n = +e;
	if (!isNaN(n)) return t.n = n, t;
	let r = e;
	r[1] === "=" && (t.o = r[0], r = r.slice(2));
	let i = !r.includes(" ") && Rs.exec(r);
	if (i) return t.t = H.UNIT, t.n = +i[1], t.u = i[2], t;
	if (t.o) return t.n = +r, t;
	if (ic(r)) return t.t = H.COLOR, t.d = jc(r), t;
	{
		let e = r.match(Ls);
		return t.t = H.COMPLEX, t.d = e ? e.map(Number) : [], t.s = r.split(Ls) || [], t;
	}
}, Bc = (e, t) => (t.t = e._valueType, t.n = e._toNumber, t.u = e._unit, t.o = null, t.d = J(e._toNumbers), t.s = J(e._strings), t), Vc = Rc(), Hc = (e, t, n) => {
	let r = e._modifier, i = e._fromNumbers, a = e._toNumbers, o = e._strings, s = o[0];
	for (let c = 0, l = a.length; c < l; c++) {
		let l = r(q(_c(i[c], a[c], t), n)), u = o[c + 1];
		s += `${u ? l + u : l}`, e._numbers[c] = l;
	}
	return s;
}, Uc = (e, t, n, r, i) => {
	let a = e.parent, o = e.duration, s = e.completed, c = e.iterationDuration, l = e.iterationCount, u = e._currentIteration, d = e._loopDelay, f = e._reversed, p = e._alternate, m = e._hasChildren, h = e._delay, g = e._currentTime, _ = h + c, v = t - h, y = gc(g, -h, o), b = gc(v, -h, o), x = v - g, S = b > 0, C = b >= o, ee = o <= W, w = i === _s.FORCE, T = 0, te = v, ne = 0;
	if (l > 1) {
		let t = c + (C ? 0 : d), n = ~~(b / t);
		e._currentIteration = gc(n, 0, l), C && e._currentIteration--, T = e._currentIteration % 2, te = b - n * t || 0;
	}
	let re = f ^ (p && T), E = e._ease, D = C ? re ? 0 : o : re ? c - te : te;
	E && (D = c * E(D / c) || 0);
	let ie = (a ? a.backwards : v < g) ? !re : !!re;
	if (e._currentTime = v, e._iterationTime = D, e.backwards = ie, S && !e.began ? (e.began = !0, !n && !(a && (ie || !a.began)) && e.onBegin(e)) : v <= 0 && (e.began = !1), !n && !m && S && e._currentIteration !== u && e.onLoop(e), w || i === _s.AUTO && (t >= (a && h > 0 ? 0 : h) && t <= _ || t <= h && y > h || t >= _ && y !== o) || D >= _ && y !== o || D <= h && y > 0 && !C || t <= y && y === o && s || C && !s && ee) {
		if (S && (e.computeDeltaTime(y), n || e.onBeforeUpdate(e)), !m) {
			let t = w || (ie ? x * -1 : x) >= G.tickThreshold, i = q(e._offset + (a ? a._offset : 0) + h + D, 12), o = e._head, s, c, l, u, d = 0;
			for (; o;) {
				let e = o._composition, n = o._currentTime, a = o._changeDuration, f = o._absoluteStartTime + o._changeDuration, p = o._nextRep, m = o._prevRep, h = e !== U.none, g = m ? m._absoluteStartTime + m._changeDuration : 0, _ = m && m.parent !== o.parent, v = !p || p._isOverridden ? f : p.parent === o.parent ? f + p._delay : p._absoluteStartTime < p._absoluteUpdateStartTime ? p._absoluteStartTime : p._absoluteUpdateStartTime;
				if ((t || (n !== a || i <= v || m && !_ && (!p || p.parent !== o.parent)) && (n !== 0 || i >= o._absoluteStartTime || _ && !o._hasFromValue && !m._isOverridden && i >= g || p && !p._isOverridden && p.parent === o.parent && p._currentTime !== 0 && D < p._startTime)) && (!m || _ || D >= o._startTime) && (!h || !o._isOverridden && (!o._isOverlapped || i <= f) && (!p || p._isOverridden || i <= v) && (!m || m._isOverridden || (_ ? i >= o._absoluteStartTime || !o._hasFromValue && i >= g : i >= g + o._delay)))) {
					let t = o._currentTime = gc(D - o._startTime, 0, a), n = o._ease(t / o._updateDuration), i = o._modifier, f = o._valueType, p = o._tweenType, m = p === V.OBJECT, g = f === H.NUMBER, _ = g && m || n === 0 || n === 1 ? -1 : G.precision, v, y;
					if (g) v = y = i(q(_c(o._fromNumber, o._toNumber, n), _));
					else if (f === H.UNIT) y = i(q(_c(o._fromNumber, o._toNumber, n), _)), v = `${y}${o._unit}`;
					else if (f === H.COLOR) {
						let e = o._numbers, t = o._fromNumbers, a = o._toNumbers, s = 1 - n, c = t[0], l = t[1], u = t[2], d = a[0], f = a[1], p = a[2];
						e[0] = i(Math.sqrt(c * c * s + d * d * n)), e[1] = i(Math.sqrt(l * l * s + f * f * n)), e[2] = i(Math.sqrt(u * u * s + p * p * n)), e[3] = i(_c(t[3], a[3], n)), (!o._setter || r) && (v = `rgba(${q(e[0], 0)},${q(e[1], 0)},${q(e[2], 0)},${e[3]})`);
					} else f === H.COMPLEX && (v = Hc(o, n, _));
					if (h && (o._number = y), !r && e !== U.blend) {
						let e = o.property;
						s = o.target, o._setter ? o._setter(s, y, o) : m ? s[e] = v : p === V.ATTRIBUTE ? s.setAttribute(e, v) : (c = s.style, p === V.TRANSFORM ? (s !== l && (l = s, u = s[xs]), u[e] = v, d = 1) : p === V.CSS ? c[e] = v : p === V.CSS_VAR && c.setProperty(e, v)), S && (ne = 1);
					} else o._value = v;
				} else n && m && !_ && D < o._startTime && (o._currentTime = 0);
				d && o._renderTransforms && (c.transform = wc(u), d = 0), o = o._next;
			}
			!n && ne && e.onRender(e);
		}
		!n && S && e.onUpdate(e);
	}
	return a && ee ? !n && (a.began && !ie && v > 0 && !s || ie && v <= 1e-11 && s) && (e.onComplete(e), e.completed = !ie) : S && C ? l === Infinity ? e._startTime += e.duration : e._currentIteration >= l - 1 && (e.paused = !0, !s && !m && (e.completed = !0, !n && !(a && (ie || !a.began)) && (e.onComplete(e), e._resolve(e)))) : e.completed = !1, ne;
}, Wc = (e, t, n, r, i) => {
	let a = e._currentIteration;
	if (Uc(e, t, n, r, i), e._hasChildren) {
		let o = e, s = o.backwards, c = r ? t : o._iterationTime, l = qs(), u = 0, d = !0;
		if (!r && o._currentIteration !== a) {
			let e = o.iterationDuration;
			Y(o, (t) => {
				if (!s) !t.completed && !t.backwards && t._currentTime < t.iterationDuration && Uc(t, e, n, 1, _s.FORCE), t.began = !1, t.completed = !1;
				else {
					let r = t.duration, i = t._offset + t._delay, a = i + r;
					!n && r <= 1e-11 && (!i || a === e) && t.onComplete(t);
				}
			}), n || o.onLoop(o);
		}
		Y(o, (e) => {
			let t = q((c - e._offset) * e._speed, 12);
			if (s && t > e._delay + e.duration) return;
			let a = e._fps < o._fps ? e.requestTick(l) : i;
			u += Uc(e, t, n, r, a), !e.completed && d && (d = !1);
		}, s), !n && u && o.onRender(o), (d || s) && o._currentTime >= o.duration && (o.paused = !0, o.completed || (o.completed = !0, n || (o.onComplete(o), o._resolve(o))));
	}
}, Gc = {}, Kc = (e, t, n) => {
	if (n === V.TRANSFORM) return Es.get(e) || e;
	if (n === V.CSS || n === V.ATTRIBUTE && ec(t) && e in t.style) {
		let t = Gc[e];
		if (t) return t;
		{
			let t = e && Gs(e);
			return Gc[e] = t, t;
		}
	} else return e;
}, qc = (e, t = !1) => {
	if (e._hasChildren) Y(e, (e) => qc(e, t), !0);
	else {
		let n = e;
		n.pause(), Y(n, (e) => {
			let r = e.property, i = e.target, a = e._tweenType, o = e._inlineValue, s = $s(o) || o === "";
			if (e._setter) {
				if (!t && !s) {
					if (zc(o, Vc), Vc.d) {
						let t = Vc.d, n = e._numbers;
						for (let e = 0, r = t.length; e < r; e++) n[e] = t[e];
					} else e._number = Vc.n;
					e._setter(e.target, e._number, e);
				}
			} else if (a === V.OBJECT) !t && !s && (i[r] = o);
			else if (i[ys]) if (a === V.ATTRIBUTE) t || (s ? i.removeAttribute(r) : i.setAttribute(r, o));
			else {
				let t = i.style;
				if (a === V.TRANSFORM) {
					let n = i[xs];
					s ? delete n[r] : n[r] = o, e._renderTransforms && (Object.keys(n).length ? t.transform = wc(n) : t.removeProperty("transform"));
				} else s ? t.removeProperty(Gs(r)) : t[r] = o;
			}
			i[ys] && n._tail === e && n.targets.forEach((e) => {
				e.getAttribute && e.getAttribute("style") === "" && e.removeAttribute("style");
			});
		});
	}
	return e;
}, Jc = class {
	constructor(e = 0) {
		this.deltaTime = 0, this._currentTime = e, this._lastTickTime = e, this._startTime = e, this._lastTime = e, this._frameDuration = ws / 240, this._fps = 240, this._speed = 1, this._hasChildren = !1, this._head = null, this._tail = null;
	}
	get fps() {
		return this._fps;
	}
	set fps(e) {
		let t = +e, n = t < 1e-11 ? W : t, r = ws / n;
		n > Hs.frameRate && (Hs.frameRate = n), this._fps = n, this._frameDuration = r;
	}
	get speed() {
		return this._speed;
	}
	set speed(e) {
		let t = +e;
		this._speed = t < 1e-11 ? W : t;
	}
	requestTick(e) {
		let t = this._frameDuration, n = e - this._lastTickTime, r = t * .25;
		return n + (r < 4 ? r : 4) < t ? _s.NONE : (this._lastTickTime = n >= t ? e - n % t : e, _s.AUTO);
	}
	computeDeltaTime(e) {
		let t = e - this._lastTime;
		return this.deltaTime = t, this._lastTime = e, t;
	}
}, Yc = {
	animation: null,
	update: ks
}, Xc = (e) => {
	let t = Yc.animation;
	return t || (t = {
		duration: W,
		computeDeltaTime: ks,
		_offset: 0,
		_delay: 0,
		_head: null,
		_tail: null
	}, Yc.animation = t, Yc.update = () => {
		e.forEach((e) => {
			for (let t in e) {
				let n = e[t], r = n._head;
				if (r) {
					let e = r._valueType, t = e === H.COMPLEX || e === H.COLOR ? J(r._fromNumbers) : null, i = r._fromNumber, a = n._tail;
					for (; a && a !== r;) {
						if (t) for (let e = 0, n = a._numbers.length; e < n; e++) t[e] += a._numbers[e];
						else i += a._number;
						a = a._prevAdd;
					}
					r._toNumber = i, r._toNumbers = t;
				}
			}
		}), Uc(t, 1, 1, 0, _s.FORCE);
	}), t;
}, Zc = ms ? requestAnimationFrame : setImmediate, Qc = ms ? cancelAnimationFrame : clearImmediate, $c = class extends Jc {
	constructor(e) {
		super(e), this.useDefaultMainLoop = !0, this.pauseOnDocumentHidden = !0, this.defaults = Hs, this.paused = !0, this.reqId = 0;
	}
	update() {
		let e = this._currentTime = qs();
		if (this.requestTick(e)) {
			this.computeDeltaTime(e);
			let t = this._speed, n = this._fps, r = this._head;
			for (; r;) {
				let i = r._next;
				r.paused ? (xc(this, r), this._hasChildren = !!this._tail, r._running = !1, r.completed && !r._cancelled && r.cancel()) : Wc(r, (e - r._startTime) * r._speed * t, 0, 0, r._fps < n ? r.requestTick(e) : _s.AUTO), r = i;
			}
			Yc.update();
		}
	}
	wake() {
		return this.useDefaultMainLoop && !this.reqId && (this.requestTick(qs()), this.reqId = Zc(el)), this;
	}
	pause() {
		if (this.reqId) return this.paused = !0, tl();
	}
	resume() {
		if (this.paused) return this.paused = !1, Y(this, (e) => e.resetTime()), this.wake();
	}
	get speed() {
		return this._speed * (G.timeScale === 1 ? 1 : ws);
	}
	set speed(e) {
		let t = e * G.timeScale;
		this._speed !== t && (this._speed = t, Y(this, (e) => e.speed = e._speed));
	}
	get timeUnit() {
		return G.timeScale === 1 ? "ms" : "s";
	}
	set timeUnit(e) {
		let t = .001, n = e === "s", r = n ? t : 1;
		if (G.timeScale !== r) {
			G.timeScale = r, G.tickThreshold = 200 * r;
			let e = n ? t : ws;
			this.defaults.duration *= e, this._speed *= e;
		}
	}
	get precision() {
		return G.precision;
	}
	set precision(e) {
		G.precision = e;
	}
}, Z = /*#__PURE__*/ (() => {
	let e = new $c(qs());
	return ms && (Ws.engine = e, gs.addEventListener("visibilitychange", () => {
		e.pauseOnDocumentHidden && (gs.hidden ? e.pause() : e.resume());
	})), e;
})(), el = () => {
	Z._head ? (Z.reqId = Zc(el), Z.update()) : Z.reqId = 0;
}, tl = () => (Qc(Z.reqId), Z.reqId = 0, Z), nl = {
	_rep: /* @__PURE__ */ new WeakMap(),
	_add: /* @__PURE__ */ new Map()
}, rl = (e, t, n = "_rep") => {
	let r = nl[n], i = r.get(e);
	return i || (i = {}, r.set(e, i)), i[t] ? i[t] : i[t] = {
		_head: null,
		_tail: null
	};
}, il = (e, t) => e._isOverridden || e._absoluteStartTime > t._absoluteStartTime, al = (e) => {
	e._isOverlapped = 1, e._isOverridden = 1, e._changeDuration = W, e._currentTime = W;
}, ol = (e, t) => {
	let n = e._composition;
	if (n === U.replace) {
		let n = e._absoluteStartTime;
		Sc(t, e, il, "_prevRep", "_nextRep");
		let r = e._prevRep;
		if (r) {
			let t = r.parent, i = r._absoluteEndTime;
			if (e.parent.id !== t.id && t.iterationCount > 1 && i + (t.duration - t.iterationDuration) > n) {
				al(r);
				let e = r._prevRep;
				for (; e && e.parent.id === t.id;) al(e), e = e._prevRep;
			}
			let a = e._absoluteUpdateStartTime;
			if (i > a) {
				let e = r._startTime, t = q(a - (i - (e + r._updateDuration)) - e, 12);
				r._changeDuration = t, r._currentTime = t, r._isOverlapped = 1, t < 1e-11 && al(r);
			}
			let o = e.parent.parent;
			if (!o || o !== t.parent) {
				let e = !0;
				if (Y(t, (t) => {
					t._isOverlapped || (e = !1);
				}), e) {
					let e = t.parent;
					if (e) {
						let n = !0;
						Y(e, (e) => {
							e !== t && Y(e, (e) => {
								e._isOverlapped || (n = !1);
							});
						}), n && e.cancel();
					} else t.cancel();
				}
			}
		}
	} else if (n === U.blend) {
		let t = rl(e.target, e.property, "_add"), n = Xc(nl._add), r = t._head;
		r || (r = { ...e }, r._composition = U.replace, r._updateDuration = W, r._startTime = 0, r._numbers = J(e._fromNumbers), r._number = 0, r._next = null, r._prev = null, Sc(t, r), Sc(n, r));
		let i = e._toNumber;
		if (e._fromNumber = r._fromNumber - i, e._toNumber = 0, e._numbers = J(e._fromNumbers), e._number = 0, r._fromNumber = i, e._toNumbers.length) {
			let t = J(e._toNumbers);
			t.forEach((t, n) => {
				e._fromNumbers[n] = r._fromNumbers[n] - t, e._toNumbers[n] = 0;
			}), r._fromNumbers = t;
		}
		Sc(t, e, null, "_prevAdd", "_nextAdd");
	}
	return e;
}, sl = (e) => {
	let t = e._composition;
	if (t !== U.none) {
		let n = e.target, r = e.property, i = nl._rep.get(n)[r];
		if (xc(i, e, "_prevRep", "_nextRep"), t === U.blend) {
			let t = nl._add, i = t.get(n);
			if (!i) return;
			let a = i[r], o = Yc.animation;
			xc(a, e, "_prevAdd", "_nextAdd");
			let s = a._head;
			if (s && s === a._tail) {
				xc(a, s, "_prevAdd", "_nextAdd"), xc(o, s);
				let e = !0;
				for (let t in i) if (i[t]._head) {
					e = !1;
					break;
				}
				e && t.delete(n);
			}
		}
	}
	return e;
}, cl = (e, t, n) => {
	let r = !1;
	return Y(t, (i) => {
		let a = i.target;
		if (e.includes(a)) {
			let e = i.property, o = i._tweenType, s = Kc(n, a, o);
			(!s || s && s === e) && (i.parent._tail === i && i._tweenType === V.TRANSFORM && i._prev && i._prev._tweenType === V.TRANSFORM && (i._prev._renderTransforms = 1), xc(t, i), sl(i), r = !0);
		}
	}, !0), r;
}, ll = (e, t, n) => {
	let r = t || Z, i;
	if (r._hasChildren) {
		let t = 0;
		Y(r, (a) => {
			if (!a._hasChildren) if (i = cl(e, a, n), i && !a._head) a.cancel(), xc(r, a);
			else {
				let e = a._offset + a._delay + a.duration;
				e > t && (t = e);
			}
			a._head ? ll(e, a, n) : a._hasChildren = !1;
		}, !0), K(r.iterationDuration) || (r.iterationDuration = t);
	} else i = cl(e, r, n);
	i && !r._head && (r._hasChildren = !1, r.cancel && r.cancel());
}, ul = (e) => (e.paused = !0, e.began = !1, e.completed = !1, e), dl = (e) => e._cancelled ? (e._hasChildren ? Y(e, dl) : Y(e, (e) => {
	e._composition !== U.none && ol(e, rl(e.target, e.property));
}), e._cancelled = 0, e) : e, fl = 0, pl = (e, t) => e._priority > t._priority, ml = class extends Jc {
	constructor(e = {}, t = null, n = 0) {
		super(0), ++fl;
		let { id: r, delay: i, duration: a, reversed: o, alternate: s, loop: c, loopDelay: l, autoplay: u, frameRate: d, playbackRate: f, priority: p, onComplete: m, onLoop: h, onPause: g, onBegin: _, onBeforeUpdate: v, onUpdate: y } = e;
		Us.current && Us.current.register(this);
		let b = t ? 0 : Z._lastTickTime, x = t ? t.defaults : G.defaults, S = Qs(i) || K(i) ? x.delay : +i, C = Qs(a) || K(a) ? Infinity : +a, ee = X(c, x.loop), w = X(l, x.loopDelay), T = ee === !0 || ee === Infinity || ee < 0 ? Infinity : ee + 1, te = 0;
		t ? te = n : (Z.reqId || Z.requestTick(qs()), te = (Z._lastTickTime - Z._startTime) * G.timeScale), this.id = K(r) ? fl : r, this.parent = t, this.duration = vc((C + w) * T - w) || 1e-11, this.backwards = !1, this.paused = !0, this.began = !1, this.completed = !1, this.onBegin = _ || x.onBegin, this.onBeforeUpdate = v || x.onBeforeUpdate, this.onUpdate = y || x.onUpdate, this.onLoop = h || x.onLoop, this.onPause = g || x.onPause, this.onComplete = m || x.onComplete, this.iterationDuration = C, this.iterationCount = T, this._autoplay = !t && X(u, x.autoplay), this._offset = te, this._delay = S, this._loopDelay = w, this._iterationTime = 0, this._currentIteration = 0, this._resolve = ks, this._running = !1, this._reversed = +X(o, x.reversed), this._reverse = this._reversed, this._cancelled = 0, this._alternate = X(s, x.alternate), this._prev = null, this._next = null, this._lastTickTime = b, this._startTime = b, this._lastTime = b, this._fps = X(d, x.frameRate), this._speed = X(f, x.playbackRate), this._priority = +X(p, 1);
	}
	get cancelled() {
		return !!this._cancelled;
	}
	set cancelled(e) {
		e ? this.cancel() : this.reset(!0).play();
	}
	get currentTime() {
		return gc(q(this._currentTime, G.precision), -this._delay, this.duration);
	}
	set currentTime(e) {
		let t = this.paused;
		this.pause().seek(+e), t || this.resume();
	}
	get iterationCurrentTime() {
		return gc(q(this._iterationTime, G.precision), 0, this.iterationDuration);
	}
	set iterationCurrentTime(e) {
		this.currentTime = this.iterationDuration * this._currentIteration + e;
	}
	get progress() {
		return gc(q(this._currentTime / this.duration, 10), 0, 1);
	}
	set progress(e) {
		this.currentTime = this.duration * e;
	}
	get iterationProgress() {
		return gc(q(this._iterationTime / this.iterationDuration, 10), 0, 1);
	}
	set iterationProgress(e) {
		let t = this.iterationDuration;
		this.currentTime = t * this._currentIteration + t * e;
	}
	get currentIteration() {
		return this._currentIteration;
	}
	set currentIteration(e) {
		this.currentTime = this.iterationDuration * gc(+e, 0, this.iterationCount - 1);
	}
	get reversed() {
		return !!this._reversed;
	}
	set reversed(e) {
		e ? this.reverse() : this.play();
	}
	get speed() {
		return super.speed;
	}
	set speed(e) {
		super.speed = e, this.resetTime();
	}
	reset(e = !1) {
		return dl(this), this._reversed && !this._reverse && (this.reversed = !1), this._iterationTime = this.iterationDuration, Wc(this, 0, 1, ~~e, _s.FORCE), ul(this), this._hasChildren && Y(this, ul), this;
	}
	init(e = !1) {
		this.fps = this._fps, this.speed = this._speed, !e && this._hasChildren && Wc(this, this.duration, 1, ~~e, _s.FORCE), this.reset(e);
		let t = this._autoplay;
		return t === !0 ? this.resume() : t && !K(t.linked) && t.link(this), this;
	}
	resetTime() {
		let e = 1 / (this._speed * Z._speed);
		return this._startTime = qs() - (this._currentTime + this._delay) * e, this;
	}
	pause() {
		return this.paused ? this : (this.paused = !0, this.onPause(this), this);
	}
	resume() {
		return this.paused ? (this.paused = !1, this.duration <= 1e-11 && !this._hasChildren ? Wc(this, W, 0, 0, _s.FORCE) : (this._running ||= (Sc(Z, this, pl), Z._hasChildren = !0, !0), this.resetTime(), this._startTime -= 12, Z.wake()), this) : this;
	}
	restart() {
		return this.reset().resume();
	}
	seek(e, t = 0, n = 0) {
		dl(this), this.completed = !1;
		let r = this.paused;
		return this.paused = !0, Wc(this, e + this._delay, ~~t, ~~n, _s.AUTO), r ? this : this.resume();
	}
	alternate() {
		let e = this._reversed, t = this.iterationCount, n = this.iterationDuration, r = t === Infinity ? fc(Cs / n) : t;
		return this._reversed = +(this._alternate && !(r % 2) ? e : !e), t === Infinity ? this.iterationProgress = this._reversed ? 1 - this.iterationProgress : this.iterationProgress : this.seek(n * r - this._currentTime), this.resetTime(), this;
	}
	play() {
		return this._reversed && this.alternate(), this.resume();
	}
	reverse() {
		return this._reversed || this.alternate(), this.resume();
	}
	cancel() {
		return this._hasChildren ? Y(this, (e) => e.cancel(), !0) : Y(this, sl), this._cancelled = 1, this.pause();
	}
	stretch(e) {
		let t = this.duration, n = yc(e);
		if (t === n) return this;
		let r = e / t, i = e <= W;
		return this.duration = i ? W : n, this.iterationDuration = i ? W : yc(this.iterationDuration * r), this._offset *= r, this._delay *= r, this._loopDelay *= r, this;
	}
	revert() {
		Wc(this, 0, 1, 0, _s.AUTO);
		let e = this._autoplay;
		return e && e.linked && e.linked === this && e.revert(), this.cancel();
	}
	complete(e = 0) {
		return this.seek(this.duration, e).cancel();
	}
	then(e = ks) {
		let t = this.then, n = () => {
			this.then = null, e(this), this.then = t, this._resolve = ks;
		};
		return new Promise((e) => (this._resolve = () => e(n()), this.completed && this._resolve(), this));
	}
};
//#endregion
//#region node_modules/.pnpm/animejs@4.5.0/node_modules/animejs/dist/modules/core/targets.js
function hl(e) {
	let t = Zs(e) ? Us.root.querySelectorAll(e) : e;
	if (t instanceof NodeList || t instanceof HTMLCollection) return t;
}
function gl(e) {
	if ($s(e)) return [];
	if (!ms) return Js(e) && e.flat(Infinity) || [e];
	if (Js(e)) {
		let t = e.flat(Infinity), n = [];
		for (let e = 0, r = t.length; e < r; e++) {
			let r = t[e];
			if (!$s(r)) {
				let e = hl(r);
				if (e) for (let t = 0, r = e.length; t < r; t++) {
					let r = e[t];
					if (!$s(r)) {
						let e = !1;
						for (let t = 0, i = n.length; t < i; t++) if (n[t] === r) {
							e = !0;
							break;
						}
						e || n.push(r);
					}
				}
				else {
					let e = !1;
					for (let t = 0, i = n.length; t < i; t++) if (n[t] === r) {
						e = !0;
						break;
					}
					e || n.push(r);
				}
			}
		}
		return n;
	}
	let t = hl(e);
	return t ? Array.from(t) : [e];
}
function _l(e) {
	let t = gl(e), n = t.length;
	for (let e = 0; e < n; e++) {
		let n = t[e];
		if (!n[vs]) {
			n[vs] = !0;
			let e = ec(n);
			(n.nodeType || e) && (n[ys] = !0, n[bs] = e, n[xs] = {});
		}
	}
	return t;
}
//#endregion
//#region node_modules/.pnpm/animejs@4.5.0/node_modules/animejs/dist/modules/core/units.js
var vl = {
	deg: 1,
	rad: 180 / mc,
	turn: 360
}, yl = {}, bl = (e, t, n, r = !1) => {
	let i = t.u, a = t.n;
	if (t.t === H.UNIT && i === n) return t;
	let o = a + i + n, s = yl[o];
	if (!K(s) && !r) t.n = s;
	else {
		let r;
		if (i in vl) r = a * vl[i] / vl[n];
		else {
			let t = e.cloneNode(), o = e.parentNode, s = o && o !== gs ? o : gs.body;
			s.appendChild(t);
			let c = t.style;
			c.width = 100 + i;
			let l = t.offsetWidth || 100;
			c.width = 100 + n;
			let u = l / (t.offsetWidth || 100);
			s.removeChild(t), r = u * a;
		}
		t.n = r, yl[o] = r;
	}
	return t.t, H.UNIT, t.u = n, t;
}, xl = (e) => e, Sl = (e = 1.68) => (t) => cc(t, +e), Cl = {
	in: (e) => (t) => e(t),
	out: (e) => (t) => 1 - e(1 - t),
	inOut: (e) => (t) => t < .5 ? e(t * 2) / 2 : 1 - e(t * -2 + 2) / 2,
	outIn: (e) => (t) => t < .5 ? (1 - e(1 - t * 2)) / 2 : (e(t * 2 - 1) + 1) / 2
}, wl = mc / 2, Tl = mc * 2, El = {
	"": Sl,
	Quad: Sl(2),
	Cubic: Sl(3),
	Quart: Sl(4),
	Quint: Sl(5),
	Sine: (e) => 1 - dc(e * wl),
	Circ: (e) => 1 - lc(1 - e * e),
	Expo: (e) => e ? cc(2, 10 * e - 10) : 0,
	Bounce: (e) => {
		let t, n = 4;
		for (; e < ((t = cc(2, --n)) - 1) / 11;);
		return 1 / cc(4, 3 - n) - 7.5625 * cc((t * 3 - 2) / 22 - e, 2);
	},
	Back: (e = 1.7) => (t) => (+e + 1) * t * t * t - +e * t * t,
	Elastic: (e = 1, t = .3) => {
		let n = gc(+e, 1, 10), r = gc(+t, W, 2), i = r / Tl * pc(1 / n), a = Tl / r;
		return (e) => e === 0 || e === 1 ? e : -n * cc(2, -10 * (1 - e)) * uc((1 - e - i) * a);
	}
}, Dl = /*#__PURE__ */ (() => {
	let e = {
		linear: xl,
		none: xl
	};
	for (let t in Cl) for (let n in El) {
		let r = El[n], i = Cl[t];
		e[t + n] = n === "" || n === "Back" || n === "Elastic" ? (e, t) => i(r(e, t)) : i(r);
	}
	return e;
})(), Ol = {
	linear: xl,
	none: xl
}, kl = (e) => {
	if (Ol[e]) return Ol[e];
	if (e.indexOf("(") <= -1) {
		let t = Cl[e] || e.includes("Back") || e.includes("Elastic") ? Dl[e]() : Dl[e];
		return t ? Ol[e] = t : xl;
	} else {
		let t = e.slice(0, -1).split("("), n = Dl[t[0]];
		return n ? Ol[e] = n(...t[1].split(",")) : xl;
	}
}, Al = [
	"steps(",
	"irregular(",
	"linear(",
	"cubicBezier("
], jl = (e) => {
	if (Zs(e)) {
		for (let t = 0, n = Al.length; t < n; t++) if (Ks(e, Al[t])) return console.warn(`String syntax for \`ease: "${e}"\` has been removed from the core and replaced by importing and passing the easing function directly: \`ease: ${e}\``), xl;
	}
	return Qs(e) ? e : Zs(e) ? kl(e) : xl;
}, Q = Rc(), $ = Rc(), Ml = {}, Nl = { func: null }, Pl = { func: null }, Fl = [null], Il = [null, null], Ll = { to: null }, Rl = 0, zl = 0, Bl, Vl, Hl = (e, t) => {
	let n = {};
	if (Js(e)) {
		let t = [].concat(...e.map((e) => Object.keys(e))).filter(ac);
		for (let r = 0, i = t.length; r < i; r++) {
			let i = t[r];
			n[i] = e.map((e) => {
				let t = {};
				for (let n in e) {
					let r = e[n];
					ac(n) ? n === i && (t.to = r) : t[n] = r;
				}
				return t;
			});
		}
	} else {
		let r = X(t.duration, G.defaults.duration);
		Object.keys(e).map((t) => ({
			o: parseFloat(t) / 100,
			p: e[t]
		})).sort((e, t) => e.o - t.o).forEach((e) => {
			let t = e.o, i = e.p;
			for (let e in i) if (ac(e)) {
				let a = n[e];
				a ||= n[e] = [];
				let o = t * r, s = a.length, c = a[s - 1], l = { to: i[e] }, u = 0;
				for (let e = 0; e < s; e++) u += a[e].duration;
				s === 1 && (l.from = c.to), i.ease && (l.ease = i.ease), l.duration = o - (s ? u : 0), a.push(l);
			}
			return e;
		});
		for (let e in n) {
			let t = n[e], r;
			for (let e = 0, n = t.length; e < n; e++) {
				let n = t[e], i = n.ease;
				n.ease = r || void 0, r = i;
			}
			t[0].duration || t.shift();
		}
	}
	return n;
}, Ul = class extends ml {
	constructor(e, t, n, r, i = !1, a = 0, o) {
		super(t, n, r), this._head, this._tail, ++zl;
		let s = _l(e), c = s.length, l = t.keyframes, u = l ? bc(Hl(l, t), t) : t, { id: d, delay: f, duration: p, ease: m, playbackEase: h, modifier: g, composition: _, onRender: v } = u, y = n ? n.defaults : G.defaults, b = X(m, y.ease), x = X(h, y.playbackEase), S = x ? jl(x) : null, C = !K(b.ease), ee = C ? b.ease : X(m, S ? "linear" : y.ease), w = C ? b.settlingDuration : X(p, y.duration), T = X(f, y.delay), te = g || y.modifier, ne = K(_) && c >= 1e3 ? U.none : K(_) ? y.composition : _, re = this._offset + (n ? n._offset : 0);
		C && (b.parent = this);
		let E = NaN, D = NaN, ie = 0, ae = 0;
		for (let e = 0; e < c; e++) {
			let t = s[e], r = a || e, c = o || s, l = NaN, d = NaN;
			for (let e in u) if (ac(e)) {
				let a = Pc(t, e), o = Ec(t, e), s = Kc(e, t, a), f = u[e], p = Js(f);
				if (i && !p && (Il[0] = f, Il[1] = f, f = Il), p) {
					let e = f.length, t = !Ys(f[0]);
					e === 2 && t ? (Ll.to = f, Fl[0] = Ll, Bl = Fl) : e > 2 && t ? (Bl = [], f.forEach((e, t) => {
						t ? t === 1 ? (Il[1] = e, Bl.push(Il)) : Bl.push(e) : Il[0] = e;
					})) : Bl = f;
				} else Fl[0] = f, Bl = Fl;
				let m = null, h = null, g = NaN, _ = 0, v = 0;
				for (let e = Bl.length; v < e; v++) {
					let i = Bl[v];
					Ys(i) ? Vl = i : (Ll.to = i, Vl = Ll), Nl.func = null, Pl.func = null;
					let l = Nc(X(Vl.composition, ne), t, r, c, null, null), u = Xs(l) ? l : U[l];
					!m && u !== U.none && (m = rl(t, s));
					let d = m ? m._tail : null, f = n && d && d.parent.parent === n ? d : h, p = Nc(Vl.to, t, r, c, Nl, f), y;
					Ys(p) && !K(p.to) ? (Vl = p, y = p.to) : y = p;
					let b = Nc(Vl.from, t, r, c, Pl, f), x = Vl.ease || ee, S = Nc(x, t, r, c, null, f), C = Qs(S) || Zs(S) ? S : x, E = !K(C) && !K(C.ease), D = E ? C.ease : C, oe = E ? C.settlingDuration : Nc(X(Vl.duration, e > 1 ? Nc(w, t, r, c, null, f) / e : w), t, r, c, null, f), se = Nc(X(Vl.delay, v ? 0 : T), t, r, c, null, f), ce = Vl.modifier || te, le = !K(b), ue = !K(y), de = Js(y), fe = de || le && ue, pe = h ? _ : 0, me = h ? _ + se : se, he = q(re + me, 12), ge = q(re + pe, 12);
					!ae && (le || de) && (ae = 1);
					let O = h;
					if (u !== U.none) {
						let e = m._head;
						for (; e && e._absoluteStartTime <= he;) if (e._isOverridden || (O = e), e = e._nextRep, e && e._absoluteStartTime >= he) for (; e;) al(e), e = e._nextRep;
					}
					if (fe) {
						zc(de ? Nc(y[0], t, r, c, Pl, f) : b, Q), zc(de ? Nc(y[1], t, r, c, Nl, f) : y, $);
						let e = Ic(t, s, a, Ml);
						Q.t === H.NUMBER && (O ? O._valueType === H.UNIT && (Q.t = H.UNIT, Q.u = O._unit) : (zc(e, Vc), Vc.t === H.UNIT && (Q.t = H.UNIT, Q.u = Vc.u)));
					} else ue ? zc(y, $) : h ? Bc(h, $) : zc(n && O && O.parent.parent === n ? O._value : Ic(t, s, a, Ml), $), le ? zc(b, Q) : h ? Bc(h, Q) : zc(n && O && O.parent.parent === n ? O._value : Ic(t, s, a, Ml), Q);
					if (Q.o && (Q.n = Lc(O ? O._toNumber : zc(Ic(t, s, a, Ml), Vc).n, Q.n, Q.o)), $.o && ($.n = Lc(Q.n, $.n, $.o)), Q.t !== $.t) {
						if (Q.t === H.COMPLEX || $.t === H.COMPLEX) {
							let e = Q.t === H.COMPLEX ? Q : $, t = Q.t === H.COMPLEX ? $ : Q;
							t.t = H.COMPLEX, t.s = J(e.s), t.d = e.d.map(() => t.n);
						} else if (Q.t === H.UNIT || $.t === H.UNIT) {
							let e = Q.t === H.UNIT ? Q : $, t = Q.t === H.UNIT ? $ : Q;
							t.t = H.UNIT, t.u = e.u;
						} else if (Q.t === H.COLOR || $.t === H.COLOR) {
							let e = Q.t === H.COLOR ? Q : $, t = Q.t === H.COLOR ? $ : Q;
							t.t = H.COLOR, t.d = e.d.map(() => 0);
						}
					}
					if (Q.u !== $.u) {
						let e = $.u ? Q : $;
						e = bl(t, e, $.u ? $.u : Q.u, !1);
					}
					if ($.d && Q.d && $.d.length !== Q.d.length) {
						let e = Q.d.length > $.d.length ? Q : $, t = e === Q ? $ : Q;
						t.d = e.d.map((e, n) => K(t.d[n]) ? 0 : t.d[n]), t.s = J(e.s);
					}
					let _e = q(+oe || 1e-11, 12), ve = Ml[s];
					$s(ve) || (Ml[s] = null);
					let ye = o ? o.set : null;
					_ = q(me + _e, 12);
					let be = Q.d, xe = $.d, Se = $.s, k = {
						parent: this,
						id: Rl++,
						property: s,
						target: t,
						_value: null,
						_toFunc: Nl.func,
						_fromFunc: Pl.func,
						_ease: jl(D),
						_fromNumbers: be ? J(be) : Ts,
						_toNumbers: xe ? J(xe) : Ts,
						_strings: Se ? J(Se) : Ts,
						_fromNumber: Q.n,
						_toNumber: $.n,
						_numbers: be ? J(be) : Ts,
						_number: Q.n,
						_unit: $.u,
						_modifier: ce,
						_currentTime: 0,
						_startTime: me,
						_delay: +se,
						_updateDuration: _e,
						_changeDuration: _e,
						_absoluteStartTime: he,
						_absoluteUpdateStartTime: ge,
						_absoluteEndTime: q(re + _, 12),
						_hasFromValue: le || de ? 1 : 0,
						_tweenType: a,
						_setter: ye,
						_valueType: $.t,
						_composition: u,
						_isOverlapped: 0,
						_isOverridden: 0,
						_renderTransforms: 0,
						_inlineValue: ve,
						_prevRep: null,
						_nextRep: null,
						_prevAdd: null,
						_nextAdd: null,
						_prev: null,
						_next: null
					};
					u !== U.none && ol(k, m);
					let Ce = k._valueType;
					if (Ce === H.COMPLEX) k._value = Hc(k, 1, -1);
					else if (Ce === H.UNIT) k._value = `${ce(k._toNumber)}${k._unit}`;
					else if (Ce === H.COLOR) {
						let e = $.d;
						k._value = `rgba(${q(e[0], 0)},${q(e[1], 0)},${q(e[2], 0)},${e[3]})`;
					} else k._value = ce(k._toNumber);
					isNaN(g) && (g = k._startTime), h = k, ie++, Sc(this, k);
				}
				(isNaN(D) || g < D) && (D = g), (isNaN(E) || _ > E) && (E = _), a === V.TRANSFORM && (l = ie - v, d = ie);
			}
			if (!isNaN(l)) {
				let e = 0;
				Y(this, (t) => {
					e >= l && e < d && (t._renderTransforms = 1, t._composition === U.blend && Y(Yc.animation, (e) => {
						e.id === t.id && (e._renderTransforms = 1);
					})), e++;
				});
			}
		}
		c || console.warn("No target found. Make sure the element you're trying to animate is accessible before creating your animation."), D ? (Y(this, (e) => {
			e._startTime - e._delay || (e._delay -= D), e._startTime -= D;
		}), E -= D) : D = 0, E || (E = W, this.iterationCount = 0), this.targets = s, this.id = K(d) ? zl : d, this.duration = E === 1e-11 ? W : vc((E + this._loopDelay) * this.iterationCount - this._loopDelay) || 1e-11, this.onRender = v || y.onRender, this._ease = S, this._delay = D, this.iterationDuration = E, !this._autoplay && ae && this.onRender(this);
	}
	stretch(e) {
		let t = this.duration;
		if (t === yc(e)) return this;
		let n = e / t;
		return Y(this, (e) => {
			e._updateDuration = yc(e._updateDuration * n), e._changeDuration = yc(e._changeDuration * n), e._currentTime *= n, e._delay *= n, e._startTime *= n, e._absoluteStartTime *= n, e._absoluteUpdateStartTime *= n, e._absoluteEndTime *= n;
		}), super.stretch(e);
	}
	refresh() {
		return Y(this, (e) => {
			let t = e._toFunc, n = e._fromFunc;
			(t || n) && (n ? (zc(n(), Q), Q.u !== e._unit && e.target[ys] && bl(e.target, Q, e._unit, !0), e._fromNumbers = J(Q.d), e._fromNumber = Q.n) : t && (zc(Ic(e.target, e.property, e._tweenType), Vc), e._fromNumbers = J(Vc.d), e._fromNumber = Vc.n), t && (zc(t(), $), e._toNumbers = J($.d), e._strings = J($.s), e._toNumber = $.o ? Lc(e._fromNumber, $.n, $.o) : $.n));
		}), this.duration === 1e-11 && this.restart(), this;
	}
	revert() {
		return super.revert(), qc(this);
	}
	then(e) {
		return super.then(e);
	}
}, Wl = (e, t) => {
	if (Ks(t, "<")) {
		let n = t[1] === "<", r = e._tail, i = r ? r._offset + r._delay : 0;
		return n ? i : i + r.duration;
	}
}, Gl = (e, t) => {
	let n = e.iterationDuration;
	if (n === 1e-11 && (n = 0), K(t)) return n;
	if (Xs(+t)) return +t;
	let r = t, i = e ? e.labels : null, a = !$s(i), o = Wl(e, r), s = !K(o), c = Bs.exec(r);
	if (c) {
		let e = c[0], t = r.split(e), l = a && t[0] ? i[t[0]] : n;
		return Lc(s ? o : a ? l : n, +t[1], e[0]);
	} else return s ? o : a ? K(i[r]) ? n : i[r] : n;
};
//#endregion
//#region node_modules/.pnpm/animejs@4.5.0/node_modules/animejs/dist/modules/timeline/timeline.js
function Kl(e) {
	return vc((e.iterationDuration + e._loopDelay) * e.iterationCount - e._loopDelay) || 1e-11;
}
function ql(e, t, n, r, i, a) {
	let o = Xs(e.duration) && e.duration <= 1e-11 ? n - W : n;
	t.composition && Wc(t, o, 1, 1, _s.AUTO);
	let s = r ? new Ul(r, e, t, o, !1, i, a) : new ml(e, t, o);
	return t.composition && s.init(!0), Sc(t, s), Y(t, (e) => {
		let n = e._offset + e._delay + e.duration;
		n > t.iterationDuration && (t.iterationDuration = n);
	}), t.duration = Kl(t), t;
}
var Jl = 0, Yl = class extends ml {
	constructor(e = {}) {
		super(e, null, 0), ++Jl, this.id = K(e.id) ? Jl : e.id, this.duration = 0, this.labels = {};
		let t = e.defaults, n = G.defaults;
		this.defaults = t ? bc(t, n) : n, this.composition = X(e.composition, !0), this.onRender = e.onRender || n.onRender;
		let r = X(e.playbackEase, n.playbackEase);
		this._ease = r ? jl(r) : null, this.iterationDuration = 0;
	}
	add(e, t, n) {
		let r = Ys(t), i = Ys(e);
		if (r || i) {
			if (this._hasChildren = !0, r) {
				let r = t, i = G.editor && G.editor.addTimelineChild, a = n && n.type === "Stagger" && G.editor, o = Qs(n) ? n : null;
				if (o || a) {
					let t = gl(e), a = this.duration, s = this.iterationDuration, c = r.id, l = 0, u = t.length, d = i ? i(e, r, this.id, n, u) : null, f = o || G.editor.resolveStagger(n.defaultValue);
					t.forEach((e) => {
						let n = { ...d || r };
						this.duration = a, this.iterationDuration = s, K(c) || (n.id = c + "-" + l);
						let i = Gl(this, f(e, l, t, null, this));
						ql(n, this, i, e, l, t), l++;
					});
				} else {
					let t = i ? i(e, r, this.id, n) : r, a = n && n.type ? n.defaultValue : n;
					ql(t, this, Gl(this, a), e);
				}
			} else ql(e, this, Gl(this, t));
			return this.composition && this.init(!0), this;
		}
	}
	sync(e, t) {
		if (K(e) || e && K(e.pause)) return this;
		e.pause();
		let n = +(e.effect ? e.effect.getTiming().duration : e.duration);
		!K(e) && !K(e.persist) && (e.persist = !0);
		let r = G.editor, i = r && r.addTimelineChild;
		r && r.addTimelineSync && (t = r.addTimelineSync(e, t, this.id), r.addTimelineChild = null);
		let a = this.add(e, {
			currentTime: [0, n],
			duration: n,
			delay: 0,
			ease: "linear",
			playbackEase: "linear"
		}, t);
		return r && (r.addTimelineChild = i), a;
	}
	set(e, t, n) {
		return K(t) ? this : (t.duration = W, t.composition = U.replace, this.add(e, t, n));
	}
	call(e, t) {
		return K(e) || e && !Qs(e) ? this : (G.editor && G.editor.addTimelineCall && (t = G.editor.addTimelineCall(e, t, this.id)), this.add({
			duration: 0,
			delay: 0,
			onComplete: () => e(this)
		}, t));
	}
	label(e, t) {
		return K(e) || e && !Zs(e) ? this : (G.editor && G.editor.addTimelineLabel && (t = G.editor.addTimelineLabel(e, t, this.id)), this.labels[e] = Gl(this, t), this);
	}
	remove(e, t) {
		return ll(gl(e), this, t), this;
	}
	stretch(e) {
		let t = this.duration;
		if (t === yc(e)) return this;
		let n = e / t, r = this.labels;
		Y(this, (e) => e.stretch(e.duration * n));
		for (let e in r) r[e] *= n;
		return super.stretch(e);
	}
	refresh() {
		return Y(this, (e) => {
			e.refresh && e.refresh();
		}), this;
	}
	revert() {
		return super.revert(), Y(this, (e) => e.revert, !0), qc(this);
	}
	then(e) {
		return super.then(e);
	}
}, Xl = (e) => G.editor ? G.editor.addTimeline(e) : new Yl(e).init(), Zl = {
	cut: [],
	morph: [
		"x",
		"y",
		"scaleX",
		"scaleY",
		"rotate",
		"opacity"
	],
	dissolve: ["opacity"],
	slide: ["x", "y"],
	scale: ["scale", "opacity"],
	blur: ["filter", "opacity"],
	wipe: ["x", "y"],
	circle: ["scale"]
}, Ql = {
	slide: "left",
	wipe: "right"
};
function $l(e, t) {
	let n = e === "left" || e === "right";
	return {
		axis: n ? "x" : "y",
		sign: e === "left" || e === "up" ? -1 : 1,
		span: n ? t.width : t.height
	};
}
var eu = .5;
function tu(e, t, n, r) {
	if (n === 0 || e === "cut") return 0;
	let i = r[n] - r[n - 1];
	return Math.max(0, Math.min(t, i));
}
function nu(e, t) {
	let n = 0;
	for (let r = 0; r < e.length && e[r].seconds <= t; r++) n = r;
	return n;
}
function ru(e, t) {
	let n = nu(e, t), r = e[n + 1];
	return r && r.morphSeconds > 0 && t > r.seconds - r.morphSeconds ? {
		kind: "morph",
		index: n + 1
	} : {
		kind: "still",
		index: n
	};
}
function iu(e, t, n) {
	let r = [];
	for (let { id: i, type: a } of e) {
		let e = t[i], o = n[i], s;
		s = e && o ? "moves" : o ? "enters" : e ? "leaves" : "absent", r.push({
			id: i,
			type: a,
			role: s,
			from: e,
			to: o
		});
	}
	return r;
}
function au(e) {
	let t = {};
	for (let n of e) {
		let e = n.role === "leaves" ? n.from : n.to;
		e && (t[n.id] = e);
	}
	return t;
}
var ou = /* @__PURE__ */ new Set([
	"dissolve",
	"slide",
	"scale",
	"blur",
	"wipe",
	"circle"
]);
function su(e, t) {
	let n = {};
	for (let r of e) {
		let e = t === "before" ? r.from ?? r.to : r.to ?? r.from;
		e && (n[r.id] = e);
	}
	return n;
}
function cu(e) {
	return e.visible ? e.opacity : 0;
}
function lu(e, t) {
	return t > 0 ? e / t : 1;
}
function uu(e, t, n, r) {
	return e + t / 2 - (n + r / 2);
}
function du(e, t) {
	return {
		x: [e.x - t.x, 0],
		y: [e.y - t.y, 0],
		rotate: [e.rotation, t.rotation],
		opacity: [cu(e), cu(t)]
	};
}
var fu = !1;
function pu() {
	fu ||= (Z.useDefaultMainLoop = !1, !0);
}
function mu() {
	return {
		seekSeconds() {},
		finish() {},
		dispose() {},
		get durationSeconds() {
			return 0;
		}
	};
}
function hu(e, t, n, r, i, a, o) {
	for (let s of e) {
		if (s.role === "absent") continue;
		let e = t(s.id);
		s.from && n.add(e, {
			...a(s.from),
			duration: r,
			ease: "inQuad"
		}, 0), s.to && n.add(e, {
			...o(s.to),
			duration: i - r,
			ease: "outQuad"
		}, r);
	}
}
function gu(e, t, n, r, i, a, o) {
	let s = document.createElement("div");
	if (s.style.position = "absolute", s.style.top = "0", s.style.left = "0", s.style.zIndex = "1000", s.style.pointerEvents = "none", s.style.background = "var(--scene-bg, #0f1620)", n === "wipe") {
		s.style.width = `${t.width}px`, s.style.height = `${t.height}px`, e.appendChild(s);
		let { axis: n, sign: c, span: l } = $l(r ?? Ql.wipe, t);
		i.add(s, {
			[n]: [-c * l, 0],
			duration: a,
			ease: "inQuad"
		}, 0), i.add(s, {
			[n]: [0, c * l],
			duration: o - a,
			ease: "outQuad"
		}, a);
	} else {
		let n = Math.sqrt(t.width ** 2 + t.height ** 2);
		s.style.width = `${n}px`, s.style.height = `${n}px`, s.style.left = `${(t.width - n) / 2}px`, s.style.top = `${(t.height - n) / 2}px`, s.style.borderRadius = "50%", e.appendChild(s), i.add(s, {
			scale: [0, 1],
			duration: a,
			ease: "inQuad"
		}, 0), i.add(s, {
			scale: [1, 0],
			duration: o - a,
			ease: "outQuad"
		}, a);
	}
	return () => s.remove();
}
function _u(e, t, n, r, i, a, o) {
	if (r === "cut" || n <= 0) return mu();
	pu();
	let s = n * 1e3, c = s * eu, l = Xl({ autoplay: !1 }), u = (e) => {
		let n = t.get(e);
		if (!n) throw Error(`Переход ссылается на элемент «${e}», которого нет на сцене`);
		return n;
	};
	for (let t of e) t.role !== "absent" && (u(t.id).style.visibility = "");
	let d = null;
	switch (r) {
		case "morph":
			for (let t of e) {
				if (t.role === "absent") continue;
				let e = u(t.id);
				switch (t.role) {
					case "moves": {
						let n = t.from, r = t.to, i = t.type === "group" ? du(n, r) : {
							x: [uu(n.x, n.width, r.x, r.width), 0],
							y: [uu(n.y, n.height, r.y, r.height), 0],
							scaleX: [lu(n.width, r.width), 1],
							scaleY: [lu(n.height, r.height), 1],
							rotate: [n.rotation, r.rotation],
							opacity: [cu(n), cu(r)]
						};
						l.add(e, {
							...i,
							duration: s,
							ease: "inOutQuad"
						}, 0);
						break;
					}
					case "enters": {
						let n = t.to;
						l.add(e, {
							opacity: [0, cu(n)],
							duration: s - c,
							ease: "outQuad"
						}, c);
						break;
					}
					case "leaves": {
						let n = t.from;
						l.add(e, {
							opacity: [cu(n), 0],
							duration: c,
							ease: "inQuad"
						}, 0);
						break;
					}
				}
			}
			break;
		case "dissolve":
			hu(e, u, l, c, s, (e) => ({ opacity: [cu(e), 0] }), (e) => ({ opacity: [0, cu(e)] }));
			break;
		case "slide": {
			let { axis: t, sign: n, span: r } = $l(i ?? Ql.slide, o);
			hu(e, u, l, c, s, () => ({ [t]: [0, n * r] }), () => ({ [t]: [-n * r, 0] }));
			break;
		}
		case "scale":
			hu(e, u, l, c, s, (e) => ({
				scale: [1, .92],
				opacity: [cu(e), 0]
			}), (e) => ({
				scale: [1.08, 1],
				opacity: [0, cu(e)]
			}));
			break;
		case "blur":
			hu(e, u, l, c, s, (e) => ({
				filter: ["blur(0px)", "blur(8px)"],
				opacity: [cu(e), 0]
			}), (e) => ({
				filter: ["blur(8px)", "blur(0px)"],
				opacity: [0, cu(e)]
			}));
			break;
		case "wipe":
		case "circle":
			d = gu(a, o, r, i, l, c, s);
			break;
	}
	l.duration < s && l.add({ duration: s }, 0);
	let f = !1;
	return {
		seekSeconds(e) {
			let t = Math.min(Math.max(e, 0), n) * 1e3;
			f ||= (l.currentTime = 0, !0), l.currentTime = t;
		},
		finish() {
			l.currentTime = 0, l.currentTime = s, f = !0, d &&= (d(), null);
		},
		dispose() {
			d &&= (d(), null);
		},
		get durationSeconds() {
			return n;
		}
	};
}
//#endregion
//#region packages/player/src/renderers/registry.ts
var vu = /* @__PURE__ */ new Map();
function yu(e, t) {
	vu.set(e, t);
}
function bu(e) {
	return vu.get(e);
}
yu("text", (e, t) => {
	e.textContent = t.content;
}), yu("image", (e, t) => {
	e.textContent = "", e.style.backgroundImage = t.content ? `url(${t.content})` : "", e.style.backgroundSize = "cover";
}), yu("shape", (e) => {
	e.textContent = "";
}), yu("video", (e, t) => {
	e.style.overflow = "hidden";
	let n = e.firstElementChild;
	if (!(n instanceof HTMLVideoElement)) {
		e.textContent = "", n = e.appendChild(document.createElement("video"));
		let t = n;
		t.muted = !0, t.playsInline = !0, t.preload = "metadata", t.style.display = "block", t.style.width = "100%", t.style.height = "100%", t.style.objectFit = "cover";
	}
	let r = n;
	t.content === "" ? r.removeAttribute("src") : r.getAttribute("src") !== t.content && r.setAttribute("src", t.content);
}), yu("group", () => {});
//#endregion
//#region packages/player/src/render.ts
var xu = 1920, Su = 1080;
function Cu(e, t, n, r = "fit") {
	if (!(e > 0) || !(t > 0)) throw RangeError(`Некорректный размер контейнера: ${e}x${t}`);
	if (r !== "fit" && !(Number.isFinite(r) && r > 0)) throw RangeError(`Некорректный масштаб сцены: ${r}`);
	let i = r === "fit" ? Math.min(e / n.width, t / n.height) : r;
	return {
		scale: i,
		offsetX: Math.round((e - n.width * i) / 2),
		offsetY: Math.round((t - n.height * i) / 2)
	};
}
function wu(e, t) {
	for (let [n, r] of Object.entries(t)) e.style.setProperty(n, r);
}
var Tu = /* @__PURE__ */ new WeakMap(), Eu = 0;
function Du(e) {
	let t = Tu.get(e);
	if (t !== void 0) return t;
	let n = `sc${++Eu}`;
	return Tu.set(e, n), e.dataset.scene = n, n;
}
function Ou(e, t) {
	let n = Du(e), r = ku(n), i = document.createElement("div"), a = [];
	for (let e of t) {
		i.style.cssText = "";
		for (let [t, n] of Object.entries(e.props)) i.style.setProperty(t, String(n));
		let t = i.style.cssText;
		t !== "" && a.push(`[data-scene="${n}"] .st-${e.id} { ${t} }`);
	}
	r.textContent = a.join("\n");
}
function ku(e) {
	let t = document.head.querySelector(`style[data-scene-styles="${e}"]`);
	if (t) return t;
	let n = document.createElement("style");
	return n.dataset.sceneStyles = e, document.head.appendChild(n), n;
}
function Au(e, t, n) {
	e.className = n.styleId === void 0 ? `scene-el scene-${t.type}` : `scene-el scene-${t.type} st-${n.styleId}`, e.dataset.id = t.id;
	let r = e.style;
	r.position = "absolute", r.left = `${n.x}px`, r.top = `${n.y}px`, r.width = `${n.width}px`, r.height = `${n.height}px`, r.zIndex = String(n.zIndex), r.opacity = String(n.opacity), r.transform = n.rotation ? `rotate(${n.rotation}deg)` : "", r.margin = "0", r.boxSizing = "border-box", r.visibility = n.visible ? "" : "hidden";
	let i = e.dataset.styleKeys;
	if (i !== void 0 && i !== "") for (let e of i.split(" ")) e in n.style || r.removeProperty(e);
	for (let [e, t] of Object.entries(n.style)) r.setProperty(e, String(t));
	let a = Object.keys(n.style);
	a.length === 0 ? delete e.dataset.styleKeys : e.dataset.styleKeys = a.join(" ");
	let o = bu(t.type);
	if (!o) throw Error(`Для типа элемента «${t.type}» не зарегистрирован DOM-рендерер`);
	o(e, t, n);
}
function ju(e, t) {
	let n = /* @__PURE__ */ new Map(), r = [], i = 0;
	for (let a of e) {
		if (t[a.id] === void 0) continue;
		i += 1;
		let { parentId: e } = a;
		if (e === void 0) {
			r.push(a);
			continue;
		}
		let o = n.get(e);
		o === void 0 ? n.set(e, [a]) : o.push(a);
	}
	let a = [], o = (e, r) => {
		let i = t[e.id];
		if (i !== void 0) {
			a.push({
				element: e,
				state: i,
				parentId: r
			});
			for (let t of n.get(e.id) ?? []) o(t, e.id);
		}
	};
	for (let e of r) o(e, void 0);
	if (a.length !== i) {
		let n = new Set(a.map((e) => e.element.id)), r = e.filter((e) => t[e.id] !== void 0 && !n.has(e.id)).map((e) => `«${e.id}» → «${e.parentId ?? ""}»`);
		throw Error(`Элементы есть на слайде, но их некуда положить: ${r.join(", ")}. Либо группы нет на этом слайде, либо вложенность зациклена.`);
	}
	return a;
}
function Mu(e, t, n, r = {
	width: xu,
	height: Su
}) {
	e.textContent = "", e.style.position = "relative", e.style.width = `${r.width}px`, e.style.height = `${r.height}px`, e.style.transformOrigin = "0 0", e.style.overflow = "hidden";
	let i = /* @__PURE__ */ new Map();
	for (let { element: r, state: a, parentId: o } of ju(t, n)) {
		let t = document.createElement("div");
		Au(t, r, a);
		let n = o === void 0 ? e : i.get(o);
		if (n === void 0) throw Error(`Узел группы «${o}» не создан раньше своего ребёнка «${r.id}»`);
		n.appendChild(t), i.set(r.id, t);
	}
	return i;
}
function Nu(e, t, n, r = {
	width: xu,
	height: Su
}, i = "fit") {
	let a = Cu(t, n, r, i);
	return e.style.transform = `translate(${a.offsetX}px, ${a.offsetY}px) scale(${a.scale})`, a;
}
//#endregion
//#region packages/player/src/slides.ts
function Pu(e, t) {
	return e !== null && e.kind === t.kind && e.index === t.index;
}
var Fu = class {
	#e;
	#t;
	#n;
	#r;
	#i;
	#a = null;
	#o = null;
	constructor(e) {
		this.#e = e.host, wu(e.host, e.theme), Ou(e.host, e.styles), this.#t = e.elements, this.#n = e.stage;
		let t = e.slides.map((t) => Bo(t.at, e.words));
		this.#r = e.slides.map((e, n) => ({
			seconds: t[n],
			slide: e,
			morphSeconds: tu(e.transition, e.transitionSeconds, n, t)
		})), this.#i = /* @__PURE__ */ new Map(), this.renderAt(0);
	}
	get nodes() {
		return this.#i;
	}
	get isTransitioning() {
		return this.#o !== null;
	}
	indexAt(e) {
		return nu(this.#r, e);
	}
	slideAt(e) {
		return this.#r[this.indexAt(e)].slide;
	}
	transitionAt(e) {
		return ru(this.#r, e).kind === "morph";
	}
	seekSeconds(e) {
		let t = ru(this.#r, e);
		Pu(this.#a, t) || this.#c(t), this.#s(e);
	}
	renderAt(e) {
		this.#o?.timeline.dispose(), this.#o = null, this.#a = null, this.#c(ru(this.#r, e)), this.#s(e);
	}
	settle() {
		let e = this.#o;
		e && (e.timeline.finish(), this.#o = null, this.#d(this.#r[e.index].slide.states));
	}
	#s(e) {
		let t = this.#o;
		if (!t) return;
		let n = e - t.startSeconds;
		if (n >= t.timeline.durationSeconds) {
			this.settle();
			return;
		}
		if (t.wholeScene) {
			let e = n >= t.timeline.durationSeconds * .5 ? "after" : "before";
			e !== t.half && (this.#d(su(t.plan, e)), this.#l(t.plan, e), t.half = e);
		}
		t.timeline.seekSeconds(n);
	}
	#c(e) {
		if (this.#a = e, e.kind === "still") {
			this.#o?.timeline.dispose(), this.#o = null, this.#d(this.#r[e.index].slide.states);
			return;
		}
		let t = this.#r[e.index], n = this.#r[e.index - 1].slide.states;
		this.#o?.timeline.dispose();
		let r = iu(this.#t, n, t.slide.states), i = ou.has(t.slide.transition);
		this.#d(i ? su(r, "before") : au(r)), i ? this.#l(r, "before") : this.#u(r), this.#o = {
			index: e.index,
			plan: r,
			wholeScene: i,
			half: "before",
			startSeconds: t.seconds - t.morphSeconds,
			timeline: _u(r, this.#i, t.morphSeconds, t.slide.transition, t.slide.transitionDirection, this.#e, this.#n)
		};
	}
	#l(e, t) {
		let n = t === "before" ? "enters" : "leaves";
		for (let t of e) {
			if (t.role !== n) continue;
			let e = this.#i.get(t.id);
			e && (e.style.opacity = "0");
		}
	}
	#u(e) {
		for (let t of e) {
			if (t.role !== "enters") continue;
			let e = this.#i.get(t.id);
			e && (e.style.opacity = "0");
		}
	}
	#d(e) {
		let t = new Set(Object.keys(e));
		if (this.#i.size === t.size && [...this.#i.keys()].every((e) => t.has(e))) {
			for (let t of this.#t) {
				let n = this.#i.get(t.id), r = e[t.id];
				n && r && Au(n, t, r);
			}
			return;
		}
		this.#i = Mu(this.#e, this.#t, e, this.#n);
	}
	destroy() {
		this.#e.textContent = "", this.#i = /* @__PURE__ */ new Map(), this.#a = null, this.#o = null;
	}
};
//#endregion
//#region packages/player/src/preview.ts
function Iu(e, t) {
	let n = Vo(e, t), { src: r, fileId: i } = n.audio, a;
	return a = r === void 0 ? i === void 0 ? {
		kind: "silent",
		seconds: n.audio.duration
	} : {
		kind: "file",
		fileId: i
	} : {
		kind: "url",
		url: r
	}, {
		source: a,
		offset: n.audio.offset,
		words: n.audio.words,
		duration: n.audio.duration,
		elements: n.elements,
		slides: n.slides,
		gates: n.gates,
		authorSpans: n.authorSpans,
		stage: {
			width: e.meta.stageWidth,
			height: e.meta.stageHeight
		},
		theme: e.meta.theme,
		styles: e.styles
	};
}
function Lu(e) {
	return e.entry;
}
function Ru(e) {
	return e.segments.map((t) => Iu(e, t.id));
}
var zu = class {
	#e;
	#t;
	#n;
	#r = 0;
	#i = !1;
	constructor(e, t) {
		this.#e = e, this.#t = t, this.#n = this.#a(t);
	}
	get positionSeconds() {
		return this.#r;
	}
	get nodes() {
		return this.#o(), this.#n.nodes;
	}
	get segment() {
		return this.#t;
	}
	get slide() {
		return this.#o(), this.#n.slideAt(this.#r);
	}
	seek(e) {
		if (this.#o(), !Number.isFinite(e) || e < 0) throw RangeError(`Некорректный момент: ${e}`);
		this.#r = e, this.#n.renderAt(e);
	}
	updateElement(e, t) {
		this.#o();
		let n = this.#n.nodes.get(e.id);
		if (!n) throw Error(`Элемента «${e.id}» нет на сцене: обновлять нечего`);
		Au(n, e, t);
	}
	rebuild(e) {
		this.#o(), this.#t = e, this.#n.destroy(), this.#n = this.#a(e), this.#n.renderAt(this.#r);
	}
	fit(e, t, n = "fit") {
		return this.#o(), Nu(this.#e, e, t, this.#t.stage, n);
	}
	destroy() {
		this.#i ||= (this.#n.destroy(), !0);
	}
	#a(e) {
		return new Fu({
			host: this.#e,
			theme: e.theme,
			styles: e.styles,
			elements: e.elements,
			slides: e.slides,
			words: e.words,
			stage: e.stage
		});
	}
	#o() {
		if (this.#i) throw Error("ScenePreview уже уничтожен");
	}
};
//#endregion
//#region packages/player/src/repeat.ts
function Bu(e, t) {
	return e.filter((e) => !t.has(e.id));
}
function Vu(e, t) {
	let n = /* @__PURE__ */ new Set();
	if (t === null) return n;
	let r = new Set(t.when.map((e) => e.variable).filter((e) => e !== void 0));
	for (let t of e) for (let e of t.gates) r.has(e.recordAs) && n.add(e.id);
	return n;
}
//#endregion
//#region packages/player/src/video.ts
var Hu = .25;
function Uu(e) {
	return [...e.querySelectorAll("video")];
}
function Wu(e, t) {
	let n = 0;
	for (let r of e) r.src !== "" && Math.abs(r.currentTime - t) > .25 && (r.currentTime = t, n += 1);
	return n;
}
function Gu(e, t) {
	for (let n of e) n.src !== "" && (n.currentTime = t, n.play().catch((e) => {
		console.error("[video] play() отклонён, картинка встанет при идущем звуке:", e);
	}));
}
function Ku(e) {
	for (let t of e) t.src !== "" && t.pause();
}
//#endregion
//#region packages/player/src/bubble.ts
var qu = .001, Ju = 280;
function Yu(e, t, n, r) {
	for (let i of e) {
		if (i.elementId !== n) continue;
		let e = Bo(i.from, t), a = Bo(i.to, t);
		if (r >= e && r < a) return "author";
	}
	return "viewer";
}
function Xu(e) {
	return e.find((e) => e.type === "video")?.id;
}
function Zu(e, t, n) {
	if (t === "author") {
		e.style.pointerEvents = "", e.style.scale = "", e.style.transition = `scale ${Ju}ms ease`;
		return;
	}
	e.style.pointerEvents = "auto", e.style.transition = `scale ${Ju}ms ease`, e.style.scale = n.collapsed ? String(qu) : "";
}
function Qu(e) {
	e.style.pointerEvents = "", e.style.scale = "", e.style.transition = "";
}
//#endregion
//#region packages/player/src/player.ts
var $u = 2, ed = .4, td = class {
	#e;
	#t;
	#n;
	#r;
	#i;
	#a;
	#o;
	#s = null;
	#c = {};
	#l = null;
	#u = null;
	#d = [];
	#f = 0;
	#p = /* @__PURE__ */ new Map();
	#m = "idle";
	#h = null;
	#g = null;
	#_ = [];
	#v = [];
	#y = null;
	#b = /* @__PURE__ */ new Map();
	#x = null;
	#S = 0;
	#C = /* @__PURE__ */ new Set();
	#w = /* @__PURE__ */ new Set();
	#T = !1;
	#E = !1;
	constructor(e, t, n = {}, r = new fs(), i = {}) {
		this.#c = { ...i.answers }, this.#E = i.standSeek === !0, this.#e = e, this.#o = r, this.#n = t, this.#i = i.startSegmentId ?? Lu(t), this.#a = Iu(t, this.#i), this.#C.add(this.#i), this.#r = n, this.#t = document.createElement("div"), this.#t.className = "player-stage", this.#t.style.pointerEvents = "none", this.#t.addEventListener("click", this.#N), e.appendChild(this.#t);
	}
	get state() {
		return this.#m;
	}
	get stageElement() {
		return this.#t;
	}
	get positionSeconds() {
		return this.#l ? this.#D(this.#l.position) : 0;
	}
	get progress() {
		return {
			chapterIndex: this.#S + 1,
			chaptersLeft: Ko(this.#n, this.#i),
			positionSeconds: this.positionSeconds,
			durationSeconds: this.#a.duration
		};
	}
	get isRepeating() {
		return this.#T;
	}
	#D(e) {
		let t = e - this.#a.offset;
		return Math.min(Math.max(t, 0), this.#a.duration);
	}
	#O(e) {
		return e + this.#a.offset;
	}
	get currentGate() {
		if (!(this.#m !== "at-gate" && this.#m !== "at-reveal")) return this.#d[this.#f]?.gate;
	}
	get currentReveal() {
		return this.#y ?? void 0;
	}
	get #k() {
		return this.#u?.nodes ?? /* @__PURE__ */ new Map();
	}
	#A(e) {
		this.#m !== e && (this.#m = e, this.#r.onStateChange?.(e));
	}
	async load() {
		this.#A("loading"), this.#g = new ResizeObserver(() => this.#M()), this.#g.observe(this.#e), this.#l = await this.#o.clockFor(this.#a.source), this.#j(), this.#A("ready");
	}
	#j() {
		this.#Q(), this.#u?.destroy(), this.#u = new Fu({
			host: this.#t,
			theme: this.#a.theme,
			styles: this.#a.styles,
			elements: this.#a.elements,
			slides: this.#a.slides,
			words: this.#a.words,
			stage: this.#a.stage
		}), this.#_ = [], this.#v = [], this.#x = null, this.#M(), this.#q(), this.#d = Bu(this.#a.gates, this.#w).map((e) => ({
			gate: e,
			at: Bo(e.at, this.#a.words)
		})).sort((e, t) => e.at - t.at), this.#f = 0, this.#p.clear(), this.#u.renderAt(0);
	}
	#M() {
		Nu(this.#t, this.#e.clientWidth, this.#e.clientHeight, this.#a.stage);
	}
	#N = (e) => {
		if (this.#m !== "at-gate") return;
		let t = this.currentGate;
		if (!t || t.config.kind !== "choice") return;
		let n = e.target, r = (n instanceof HTMLElement ? n.closest("[data-id]") : null)?.dataset.id;
		if (r === void 0) return;
		let i = t.config.options.find((e) => e.elementId === r);
		!i || !this.#F(i.when) || this.answer(i.id);
	};
	#P(e) {
		if (e.config.kind !== "choice") return [];
		let t = [];
		for (let n of e.config.options) {
			let e = n.elementId === void 0 ? void 0 : this.#k.get(n.elementId);
			if (!this.#F(n.when)) {
				e && (this.#v.push({
					id: n.id,
					opacity: e.style.opacity
				}), e.style.opacity = "0");
				continue;
			}
			if (!e) {
				t.push(n);
				continue;
			}
			e.dataset.answerOption = "1", e.style.cursor = "pointer", this.#_.push(n.id);
		}
		return t;
	}
	#F(e) {
		return e === void 0 || Wo(e, this.#c);
	}
	#I() {
		for (let e of this.#_) {
			let t = this.#k.get(e);
			t && (delete t.dataset.answerOption, t.style.cursor = "");
		}
		this.#_ = [];
		for (let e of this.#v) {
			let t = this.#k.get(e.id);
			t && (t.style.opacity = e.opacity);
		}
		this.#v = [];
	}
	async play() {
		let e = this.#Q();
		if (this.#m !== "playing") {
			if (this.#m === "at-gate") throw Error("Нельзя продолжить, пока гейт не пройден");
			if (await e.wake(), this.#L(0)) {
				e.holdBeforeStart(this.#O(0)), this.#K();
				return;
			}
			e.start(this.#m === "ended" ? this.#O(0) : e.position), this.#m === "ended" && (this.#f = 0), Gu(Uu(this.#t), e.position), this.#A("playing"), this.#R();
		}
	}
	#L(e) {
		let t = this.#d[this.#f];
		return t !== void 0 && e >= t.at;
	}
	#R() {
		let e = () => {
			if (this.#m !== "playing") return;
			let t = this.#Q(), n = this.#re(), r = this.#D(t.position);
			if (n.seekSeconds(r), Wu(Uu(this.#t), t.position), this.#$(r), this.#r.onFrame?.(r), this.#L(r)) {
				this.#G();
				return;
			}
			if (this.#B()) {
				this.#h = requestAnimationFrame(e);
				return;
			}
			if (this.#z(r), r >= this.#a.duration - .02) {
				let e = this.#d[this.#f];
				if (e !== void 0 && e.at <= this.#a.duration) {
					this.#G();
					return;
				}
				this.#H();
				return;
			}
			this.#h = requestAnimationFrame(e);
		};
		this.#h = requestAnimationFrame(e);
	}
	#z(e) {
		if (this.#s) return;
		let t = this.#l;
		if (!t) return;
		let n = Go(Vo(this.#n, this.#i), this.#c);
		if (n === null) return;
		let r = n.goto, i = this.#a.duration - e;
		if (i > $u) return;
		let a = Iu(this.#n, r), o = a.source;
		if (i > ed) {
			this.#o.warm(o);
			return;
		}
		let s = t.scheduleEnd;
		if (s === null) return;
		let c = s - t.scheduleNow;
		if (c <= 0) return;
		let l = this.#o.clockIfReady(o);
		if (!l) return;
		let u = l.start(a.offset, { leadTime: c });
		this.#s = {
			clock: l,
			nodeId: r,
			startsAt: u,
			choice: n
		};
	}
	#B() {
		let e = this.#s, t = this.#l;
		return !e || !t || t.scheduleNow < e.startsAt ? !1 : (this.#l?.stop(), this.#l = e.clock, this.#i = e.nodeId, this.#a = Iu(this.#n, e.nodeId), this.#s = null, this.#S += 1, this.#W(e.nodeId, e.choice), this.#j(), !0);
	}
	#V() {
		let e = this.#s;
		e && (e.clock.stop(), this.#s = null);
	}
	async #H() {
		let e = Go(Vo(this.#n, this.#i), this.#c);
		if (e === null) {
			this.#X();
			return;
		}
		await this.#U(e.goto, e);
	}
	async #U(e, t) {
		this.#Z(), this.#V(), this.#l?.stop(), this.#i = e, this.#a = Iu(this.#n, e), this.#S += 1, this.#W(e, t), this.#l = await this.#o.clockFor(this.#a.source), await this.#l.wake(), this.#j(), this.#l.start(this.#O(0)), this.#A("playing"), this.#R();
	}
	#W(e, t) {
		if (this.#T = this.#C.has(e), this.#C.add(e), this.#T) for (let e of Vu(Ru(this.#n), t.rule)) this.#w.delete(e);
	}
	async #G() {
		let e = this.#Q(), t = this.#re(), n = this.#d[this.#f];
		if (!n) throw Error("Гейт исчез между проверкой и остановкой");
		this.#V(), await e.freezeAt(this.#O(n.at)), t.seekSeconds(n.at), t.settle(), this.#K();
	}
	#K() {
		let e = this.#d[this.#f];
		if (!e) throw Error("Нет гейта для открытия");
		Ku(Uu(this.#t)), this.#Z(), this.#t.style.pointerEvents = "auto", this.#A("at-gate"), this.#q();
		let t = this.#P(e.gate);
		this.#r.onGateOpen?.(e.gate, t);
	}
	#q() {
		let e = Vo(this.#n, this.#i);
		for (let t of qo(e)) this.#o.warm(Iu(this.#n, t).source);
	}
	seek(e) {
		if (!this.#E) throw Error("Перемотка доступна только на стенде автора: плеер создан без признака standSeek (ADR-036)");
		if (!Number.isFinite(e)) throw RangeError(`Позиция перемотки не число: ${String(e)}`);
		let t = this.#Q(), n = t;
		if (typeof n.seek != "function") throw Error("Часы этой главы не умеют перематывать: перемотка стенда недоступна");
		let r = Math.min(Math.max(e, 0), this.#a.duration);
		n.seek(this.#O(r)), this.#re().seekSeconds(r), Wu(Uu(this.#t), t.position), this.#f = this.#d.findIndex((e) => e.at > r), this.#f < 0 && (this.#f = this.#d.length), this.#r.onFrame?.(r);
	}
	async answer(e) {
		if (this.#m !== "at-gate") throw Error(`Ответ вне гейта: состояние ${this.#m}`);
		let t = this.#d[this.#f];
		if (!t) throw Error("Нет открытого гейта");
		let { gate: n } = t;
		if (n.config.kind === "choice") {
			let t = n.config.options.find((t) => t.id === e);
			if (t && !this.#F(t.when)) throw Error(`Вариант «${e}» скрыт условием и не может быть ответом`);
		}
		let r = (this.#p.get(n.id) ?? 0) + 1;
		this.#p.set(n.id, r);
		let i = nd(n, e), a = n.maxAttempts !== null && r >= n.maxAttempts, o = n.config.kind === "choice" && n.config.correctId === null, s;
		s = i || o || n.onWrong === "continue" ? "continue" : n.onWrong === "inline-explain" || n.onWrong === "inline-hint" || a ? "reveal" : "retry";
		let c = {
			gate: n,
			correct: i,
			attemptsUsed: r,
			outcome: s
		};
		return this.#c = {
			...this.#c,
			[n.recordAs]: {
				value: e ?? "",
				correct: i
			}
		}, this.#w.add(n.id), this.#r.onGateResolved?.(c), s === "continue" ? await this.#Y() : s === "reveal" && this.#J(n), c;
	}
	#J(e) {
		this.#I(), this.#t.style.pointerEvents = "none";
		let t = e.config;
		this.#y = {
			gate: e,
			kind: e.onWrong === "inline-hint" ? "inline-hint" : "inline-explain",
			correctOption: t.kind === "choice" ? t.options.find((e) => e.id === t.correctId) : void 0
		}, this.#A("at-reveal"), this.#r.onRevealOpen?.(this.#y);
	}
	async continueAfterReveal() {
		if (this.#m !== "at-reveal") throw Error(`Разбор не открыт: состояние ${this.#m}`);
		await this.#Y();
	}
	async #Y() {
		let e = this.#Q();
		this.#y = null, this.#I(), this.#t.style.pointerEvents = "none", this.#f += 1, await e.resumeFromFreeze(), Gu(Uu(this.#t), e.position), this.#A("playing"), this.#R();
	}
	#X() {
		this.#Z(), Ku(Uu(this.#t)), this.#V(), this.#l?.stop(), this.#A("ended");
	}
	#Z() {
		this.#h !== null && (cancelAnimationFrame(this.#h), this.#h = null);
	}
	destroy() {
		this.#Z();
		let e = Xu(this.#a.elements), t = e === void 0 ? void 0 : this.#k.get(e);
		t && Qu(t), this.#x?.remove(), this.#x = null, Ku(Uu(this.#t)), this.#V(), this.#g?.disconnect(), this.#l?.stop(), this.#u?.destroy(), this.#o.close(), this.#t.remove(), this.#A("idle");
	}
	#Q() {
		if (!this.#l) throw Error("Плеер не загружен: сначала load()");
		return this.#l;
	}
	#$(e) {
		let t = Xu(this.#a.elements);
		if (t === void 0) {
			this.#ne();
			return;
		}
		let n = this.#k.get(t);
		if (!n) {
			this.#ne();
			return;
		}
		let r = Yu(this.#a.authorSpans, this.#a.words, t, e), i = this.#b.get(t);
		if (i || (i = { collapsed: !1 }, this.#b.set(t, i)), Zu(n, r, i), r === "author") {
			this.#ne();
			return;
		}
		this.#ee(n, t, i);
	}
	#ee(e, t, n) {
		let r = this.#x;
		r || (r = document.createElement("button"), r.type = "button", r.className = "player-bubble-toggle", r.dataset.testid = "bubble-toggle", r.style.pointerEvents = "auto", r.style.position = "absolute", r.style.width = "36px", r.style.height = "36px", r.style.padding = "0", r.style.border = "0", r.style.borderRadius = "50%", r.style.background = "rgba(17, 20, 26, 0.72)", r.style.color = "#f5f7fa", r.style.fontSize = "18px", r.style.lineHeight = "1", r.style.cursor = "pointer", r.addEventListener("click", () => {
			let e = this.#b.get(t);
			if (!e) return;
			e.collapsed = !e.collapsed;
			let n = this.#k.get(t);
			n && Zu(n, "viewer", e), this.#te(r, e);
		}), this.#t.appendChild(r), this.#x = r);
		let i = Number.parseFloat(e.style.left) || 0, a = Number.parseFloat(e.style.top) || 0, o = Number.parseFloat(e.style.width) || 0;
		r.style.left = `${i + o - 44}px`, r.style.top = `${a - 8}px`, r.style.zIndex = String((Number(e.style.zIndex) || 0) + 1), r.style.display = "", this.#te(r, n);
	}
	#te(e, t) {
		e.textContent = t.collapsed ? "⤢" : "⤡", e.setAttribute("aria-label", t.collapsed ? "Показать говорящую голову" : "Свернуть говорящую голову"), e.setAttribute("aria-pressed", String(t.collapsed));
	}
	#ne() {
		this.#x && (this.#x.style.display = "none");
	}
	#re() {
		if (!this.#u) throw Error("Плеер не загружен: сначала load()");
		return this.#u;
	}
};
function nd(e, t) {
	let n = e.config;
	switch (n.kind) {
		case "continue": return !0;
		case "choice": return t === n.correctId;
		case "input": {
			if (t === void 0) return !1;
			let e = n.caseSensitive ? t.trim() : t.trim().toLowerCase();
			return n.accept.some((t) => (n.caseSensitive ? t : t.toLowerCase()) === e);
		}
	}
}
//#endregion
export { us as AudioClock, fs as AudioClocks, Su as DEFAULT_STAGE_HEIGHT, xu as DEFAULT_STAGE_WIDTH, Ql as FROZEN_DIRECTION, td as Player, Jo as ProjectLoadError, zu as ScenePreview, ds as SilentClock, Fu as SlideEngine, Zl as TECHNIQUE_PROPS, eu as UNMATCHED_FRACTION, Hu as VIDEO_RESYNC_S, ou as WHOLE_SCENE, Ru as allSegments, Vu as answersToClear, Au as applyElement, Nu as applyFit, Ou as applyStyles, wu as applyTheme, _u as buildMorph, Uu as collectVideos, Lu as entrySegmentOf, Cu as fitStage, ns as getAudio, bu as getElementRenderer, su as halfStates, nu as indexAt, nd as isCorrect, au as layoutStatesFor, Yo as loadProject, cs as loadTrack, tu as morphSecondsFor, $l as motionOf, Bu as openableGates, Ku as pauseVideos, ru as phaseAt, iu as planMorph, ju as planPlacement, ts as putAudio, yu as registerElementRenderer, is as releaseAudioUrl, Mu as renderScene, rs as resolveAudioUrl, Iu as segmentOf, Gu as startVideos, Wu as syncVideos };
