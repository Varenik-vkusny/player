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
function ee(e) {
	return JSON.stringify(e);
}
function te(e) {
	return e.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
var ne = "captureStackTrace" in Error ? Error.captureStackTrace : (...e) => {};
function g(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
var re = /* @__PURE__*/ c(() => {
	if (i.jitless || typeof navigator < "u" && navigator?.userAgent?.includes("Cloudflare")) return !1;
	try {
		return Function(""), !0;
	} catch {
		return !1;
	}
});
function _(e) {
	if (g(e) === !1) return !1;
	let t = e.constructor;
	if (t === void 0 || typeof t != "function") return !0;
	let n = t.prototype;
	return !(g(n) === !1 || Object.prototype.hasOwnProperty.call(n, "isPrototypeOf") === !1);
}
function ie(e) {
	return _(e) ? { ...e } : Array.isArray(e) ? [...e] : e instanceof Map ? new Map(e) : e instanceof Set ? new Set(e) : e;
}
var ae = /* @__PURE__*/ new Set([
	"string",
	"number",
	"symbol"
]);
function v(e) {
	return e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function y(e, t, n) {
	let r = new e._zod.constr(t ?? e._zod.def);
	return (!t || n?.parent) && (r._zod.parent = e), r;
}
function b(e) {
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
function oe(e) {
	return Object.keys(e).filter((t) => e[t]._zod.optin === "optional" && e[t]._zod.optout === "optional");
}
var se = {
	safeint: [-(2 ** 53 - 1), 2 ** 53 - 1],
	int32: [-2147483648, 2147483647],
	uint32: [0, 4294967295],
	float32: [-34028234663852886e22, 34028234663852886e22],
	float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
};
function ce(e, t) {
	let n = e._zod.def, r = n.checks;
	if (r && r.length > 0) throw Error(".pick() cannot be used on object schemas containing refinements");
	return y(e, h(e._zod.def, {
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
function le(e, t) {
	let n = e._zod.def, r = n.checks;
	if (r && r.length > 0) throw Error(".omit() cannot be used on object schemas containing refinements");
	return y(e, h(e._zod.def, {
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
function ue(e, t) {
	if (!_(t)) throw Error("Invalid input to extend: expected a plain object");
	let n = e._zod.def.checks;
	if (n && n.length > 0) {
		let n = e._zod.def.shape;
		for (let e in t) if (Object.getOwnPropertyDescriptor(n, e) !== void 0) throw Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
	}
	return y(e, h(e._zod.def, { get shape() {
		let n = {
			...e._zod.def.shape,
			...t
		};
		return m(this, "shape", n), n;
	} }));
}
function de(e, t) {
	if (!_(t)) throw Error("Invalid input to safeExtend: expected a plain object");
	return y(e, h(e._zod.def, { get shape() {
		let n = {
			...e._zod.def.shape,
			...t
		};
		return m(this, "shape", n), n;
	} }));
}
function fe(e, t) {
	if (e._zod.def.checks?.length) throw Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
	return y(e, h(e._zod.def, {
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
function pe(e, t, n) {
	let r = t._zod.def.checks;
	if (r && r.length > 0) throw Error(".partial() cannot be used on object schemas containing refinements");
	return y(t, h(t._zod.def, {
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
function me(e, t, n) {
	return y(t, h(t._zod.def, { get shape() {
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
function x(e, t = 0) {
	if (e.aborted === !0) return !0;
	for (let n = t; n < e.issues.length; n++) if (e.issues[n]?.continue !== !0) return !0;
	return !1;
}
function he(e, t = 0) {
	if (e.aborted === !0) return !0;
	for (let n = t; n < e.issues.length; n++) if (e.issues[n]?.continue === !1) return !0;
	return !1;
}
function S(e, t) {
	return t.map((t) => {
		var n;
		return (n = t).path ?? (n.path = []), t.path.unshift(e), t;
	});
}
function C(e) {
	return typeof e == "string" ? e : e?.message;
}
function w(e, t, n) {
	let r = e.message ? e.message : C(e.inst?._zod.def?.error?.(e)) ?? C(t?.error?.(e)) ?? C(n.customError?.(e)) ?? C(n.localeError?.(e)) ?? "Invalid input", { inst: i, continue: a, input: o, ...s } = e;
	return s.path ??= [], s.message = r, t?.reportInput && (s.input = o), s;
}
function ge(e) {
	return Array.isArray(e) ? "array" : typeof e == "string" ? "string" : "unknown";
}
function T(...e) {
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
var _e = (e, t) => {
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
}, ve = t("$ZodError", _e), ye = t("$ZodError", _e, { Parent: Error });
function be(e, t = (e) => e.message) {
	let n = {}, r = [];
	for (let i of e.issues) i.path.length > 0 ? (n[i.path[0]] = n[i.path[0]] || [], n[i.path[0]].push(t(i))) : r.push(t(i));
	return {
		formErrors: r,
		fieldErrors: n
	};
}
function xe(e, t = (e) => e.message) {
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
var Se = (e) => (t, r, i, o) => {
	let s = i ? {
		...i,
		async: !1
	} : { async: !1 }, c = t._zod.run({
		value: r,
		issues: []
	}, s);
	if (c instanceof Promise) throw new n();
	if (c.issues.length) {
		let t = new ((o?.Err) ?? e)(c.issues.map((e) => w(e, s, a())));
		throw ne(t, o?.callee), t;
	}
	return c.value;
}, Ce = (e) => async (t, n, r, i) => {
	let o = r ? {
		...r,
		async: !0
	} : { async: !0 }, s = t._zod.run({
		value: n,
		issues: []
	}, o);
	if (s instanceof Promise && (s = await s), s.issues.length) {
		let t = new ((i?.Err) ?? e)(s.issues.map((e) => w(e, o, a())));
		throw ne(t, i?.callee), t;
	}
	return s.value;
}, E = (e) => (t, r, i) => {
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
		error: new (e ?? ve)(s.issues.map((e) => w(e, o, a())))
	} : {
		success: !0,
		data: s.value
	};
}, we = /* @__PURE__*/ E(ye), D = (e) => async (t, n, r) => {
	let i = r ? {
		...r,
		async: !0
	} : { async: !0 }, o = t._zod.run({
		value: n,
		issues: []
	}, i);
	return o instanceof Promise && (o = await o), o.issues.length ? {
		success: !1,
		error: new e(o.issues.map((e) => w(e, i, a())))
	} : {
		success: !0,
		data: o.value
	};
}, Te = /* @__PURE__*/ D(ye), Ee = (e) => (t, n, r) => {
	let i = r ? {
		...r,
		direction: "backward"
	} : { direction: "backward" };
	return Se(e)(t, n, i);
}, De = (e) => (t, n, r) => Se(e)(t, n, r), Oe = (e) => async (t, n, r) => {
	let i = r ? {
		...r,
		direction: "backward"
	} : { direction: "backward" };
	return Ce(e)(t, n, i);
}, ke = (e) => async (t, n, r) => Ce(e)(t, n, r), Ae = (e) => (t, n, r) => {
	let i = r ? {
		...r,
		direction: "backward"
	} : { direction: "backward" };
	return E(e)(t, n, i);
}, je = (e) => (t, n, r) => E(e)(t, n, r), Me = (e) => async (t, n, r) => {
	let i = r ? {
		...r,
		direction: "backward"
	} : { direction: "backward" };
	return D(e)(t, n, i);
}, Ne = (e) => async (t, n, r) => D(e)(t, n, r), Pe = /^[cC][0-9a-z]{6,}$/, Fe = /^[0-9a-z]+$/, Ie = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/, Le = /^[0-9a-vA-V]{20}$/, Re = /^[A-Za-z0-9]{27}$/, ze = /^[a-zA-Z0-9_-]{21}$/, Be = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/, Ve = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/, He = (e) => e ? RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${e}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`) : /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/, Ue = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/, We = "^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$";
function Ge() {
	return new RegExp(We, "u");
}
var Ke = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/, qe = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/, Je = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/, Ye = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/, Xe = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/, Ze = /^[A-Za-z0-9_-]*$/, Qe = /^https?$/, $e = /^\+[1-9]\d{6,14}$/, et = "(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))", tt = /*@__PURE__*/ RegExp(`^${et}$`);
function nt(e) {
	let t = "(?:[01]\\d|2[0-3]):[0-5]\\d";
	return typeof e.precision == "number" ? e.precision === -1 ? `${t}` : e.precision === 0 ? `${t}:[0-5]\\d` : `${t}:[0-5]\\d\\.\\d{${e.precision}}` : `${t}(?::[0-5]\\d(?:\\.\\d+)?)?`;
}
function rt(e) {
	return RegExp(`^${nt(e)}$`);
}
function it(e) {
	let t = nt({ precision: e.precision }), n = ["Z"];
	e.local && n.push(""), e.offset && n.push("([+-](?:[01]\\d|2[0-3]):[0-5]\\d)");
	let r = `${t}(?:${n.join("|")})`;
	return RegExp(`^${et}T(?:${r})$`);
}
var at = (e) => {
	let t = e ? `[\\s\\S]{${e?.minimum ?? 0},${e?.maximum ?? ""}}` : "[\\s\\S]*";
	return RegExp(`^${t}$`);
}, ot = /^-?\d+$/, st = /^-?\d+(?:\.\d+)?$/, ct = /^(?:true|false)$/i, lt = /^[^A-Z]*$/, ut = /^[^a-z]*$/, O = /*@__PURE__*/ t("$ZodCheck", (e, t) => {
	var n;
	e._zod ??= {}, e._zod.def = t, (n = e._zod).onattach ?? (n.onattach = []);
}), dt = {
	number: "number",
	bigint: "bigint",
	object: "date"
}, ft = /*@__PURE__*/ t("$ZodCheckLessThan", (e, t) => {
	O.init(e, t);
	let n = dt[typeof t.value];
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
}), pt = /*@__PURE__*/ t("$ZodCheckGreaterThan", (e, t) => {
	O.init(e, t);
	let n = dt[typeof t.value];
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
}), mt = /*@__PURE__*/ t("$ZodCheckMultipleOf", (e, t) => {
	O.init(e, t), e._zod.onattach.push((e) => {
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
}), ht = /*@__PURE__*/ t("$ZodCheckNumberFormat", (e, t) => {
	O.init(e, t), t.format = t.format || "float64";
	let n = t.format?.includes("int"), r = n ? "int" : "number", [i, a] = se[t.format];
	e._zod.onattach.push((e) => {
		let r = e._zod.bag;
		r.format = t.format, r.minimum = i, r.maximum = a, n && (r.pattern = ot);
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
}), gt = /*@__PURE__*/ t("$ZodCheckMaxLength", (e, t) => {
	var n;
	O.init(e, t), (n = e._zod.def).when ?? (n.when = (e) => {
		let t = e.value;
		return !l(t) && t.length !== void 0;
	}), e._zod.onattach.push((e) => {
		let n = e._zod.bag.maximum ?? Infinity;
		t.maximum < n && (e._zod.bag.maximum = t.maximum);
	}), e._zod.check = (n) => {
		let r = n.value;
		if (r.length <= t.maximum) return;
		let i = ge(r);
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
}), _t = /*@__PURE__*/ t("$ZodCheckMinLength", (e, t) => {
	var n;
	O.init(e, t), (n = e._zod.def).when ?? (n.when = (e) => {
		let t = e.value;
		return !l(t) && t.length !== void 0;
	}), e._zod.onattach.push((e) => {
		let n = e._zod.bag.minimum ?? -Infinity;
		t.minimum > n && (e._zod.bag.minimum = t.minimum);
	}), e._zod.check = (n) => {
		let r = n.value;
		if (r.length >= t.minimum) return;
		let i = ge(r);
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
}), vt = /*@__PURE__*/ t("$ZodCheckLengthEquals", (e, t) => {
	var n;
	O.init(e, t), (n = e._zod.def).when ?? (n.when = (e) => {
		let t = e.value;
		return !l(t) && t.length !== void 0;
	}), e._zod.onattach.push((e) => {
		let n = e._zod.bag;
		n.minimum = t.length, n.maximum = t.length, n.length = t.length;
	}), e._zod.check = (n) => {
		let r = n.value, i = r.length;
		if (i === t.length) return;
		let a = ge(r), o = i > t.length;
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
}), k = /*@__PURE__*/ t("$ZodCheckStringFormat", (e, t) => {
	var n, r;
	O.init(e, t), e._zod.onattach.push((e) => {
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
}), yt = /*@__PURE__*/ t("$ZodCheckRegex", (e, t) => {
	k.init(e, t), e._zod.check = (n) => {
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
}), bt = /*@__PURE__*/ t("$ZodCheckLowerCase", (e, t) => {
	t.pattern ??= lt, k.init(e, t);
}), xt = /*@__PURE__*/ t("$ZodCheckUpperCase", (e, t) => {
	t.pattern ??= ut, k.init(e, t);
}), St = /*@__PURE__*/ t("$ZodCheckIncludes", (e, t) => {
	O.init(e, t);
	let n = v(t.includes), r = new RegExp(typeof t.position == "number" ? `^.{${t.position}}${n}` : n);
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
}), Ct = /*@__PURE__*/ t("$ZodCheckStartsWith", (e, t) => {
	O.init(e, t);
	let n = RegExp(`^${v(t.prefix)}.*`);
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
}), wt = /*@__PURE__*/ t("$ZodCheckEndsWith", (e, t) => {
	O.init(e, t);
	let n = RegExp(`.*${v(t.suffix)}$`);
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
}), Tt = /*@__PURE__*/ t("$ZodCheckOverwrite", (e, t) => {
	O.init(e, t), e._zod.check = (e) => {
		e.value = t.tx(e.value);
	};
}), Et = class {
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
}, Dt = {
	major: 4,
	minor: 4,
	patch: 3
}, A = /*@__PURE__*/ t("$ZodType", (e, t) => {
	var r;
	e ??= {}, e._zod.def = t, e._zod.bag = e._zod.bag || {}, e._zod.version = Dt;
	let i = [...e._zod.def.checks ?? []];
	e._zod.traits.has("$ZodCheck") && i.unshift(e);
	for (let t of i) for (let n of t._zod.onattach) n(e);
	if (i.length === 0) (r = e._zod).deferred ?? (r.deferred = []), e._zod.deferred?.push(() => {
		e._zod.run = e._zod.parse;
	});
	else {
		let t = (e, t, r) => {
			let i = x(e), a;
			for (let o of t) {
				if (o._zod.def.when) {
					if (he(e) || !o._zod.def.when(e)) continue;
				} else if (i) continue;
				let t = e.issues.length, s = o._zod.check(e);
				if (s instanceof Promise && r?.async === !1) throw new n();
				if (a || s instanceof Promise) a = (a ?? Promise.resolve()).then(async () => {
					await s, e.issues.length !== t && (i ||= x(e, t));
				});
				else {
					if (e.issues.length === t) continue;
					i ||= x(e, t);
				}
			}
			return a ? a.then(() => e) : e;
		}, r = (r, a, o) => {
			if (x(r)) return r.aborted = !0, r;
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
				let n = we(e, t);
				return n.success ? { value: n.data } : { issues: n.error?.issues };
			} catch {
				return Te(e, t).then((e) => e.success ? { value: e.data } : { issues: e.error?.issues });
			}
		},
		vendor: "zod",
		version: 1
	}));
}), Ot = /*@__PURE__*/ t("$ZodString", (e, t) => {
	A.init(e, t), e._zod.pattern = [...e?._zod.bag?.patterns ?? []].pop() ?? at(e._zod.bag), e._zod.parse = (n, r) => {
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
}), j = /*@__PURE__*/ t("$ZodStringFormat", (e, t) => {
	k.init(e, t), Ot.init(e, t);
}), kt = /*@__PURE__*/ t("$ZodGUID", (e, t) => {
	t.pattern ??= Ve, j.init(e, t);
}), At = /*@__PURE__*/ t("$ZodUUID", (e, t) => {
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
		t.pattern ??= He(e);
	} else t.pattern ??= He();
	j.init(e, t);
}), jt = /*@__PURE__*/ t("$ZodEmail", (e, t) => {
	t.pattern ??= Ue, j.init(e, t);
}), Mt = /*@__PURE__*/ t("$ZodURL", (e, t) => {
	j.init(e, t), e._zod.check = (n) => {
		try {
			let r = n.value.trim();
			if (!t.normalize && t.protocol?.source === Qe.source && !/^https?:\/\//i.test(r)) {
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
}), Nt = /*@__PURE__*/ t("$ZodEmoji", (e, t) => {
	t.pattern ??= Ge(), j.init(e, t);
}), Pt = /*@__PURE__*/ t("$ZodNanoID", (e, t) => {
	t.pattern ??= ze, j.init(e, t);
}), Ft = /*@__PURE__*/ t("$ZodCUID", (e, t) => {
	t.pattern ??= Pe, j.init(e, t);
}), It = /*@__PURE__*/ t("$ZodCUID2", (e, t) => {
	t.pattern ??= Fe, j.init(e, t);
}), Lt = /*@__PURE__*/ t("$ZodULID", (e, t) => {
	t.pattern ??= Ie, j.init(e, t);
}), Rt = /*@__PURE__*/ t("$ZodXID", (e, t) => {
	t.pattern ??= Le, j.init(e, t);
}), zt = /*@__PURE__*/ t("$ZodKSUID", (e, t) => {
	t.pattern ??= Re, j.init(e, t);
}), Bt = /*@__PURE__*/ t("$ZodISODateTime", (e, t) => {
	t.pattern ??= it(t), j.init(e, t);
}), Vt = /*@__PURE__*/ t("$ZodISODate", (e, t) => {
	t.pattern ??= tt, j.init(e, t);
}), Ht = /*@__PURE__*/ t("$ZodISOTime", (e, t) => {
	t.pattern ??= rt(t), j.init(e, t);
}), Ut = /*@__PURE__*/ t("$ZodISODuration", (e, t) => {
	t.pattern ??= Be, j.init(e, t);
}), Wt = /*@__PURE__*/ t("$ZodIPv4", (e, t) => {
	t.pattern ??= Ke, j.init(e, t), e._zod.bag.format = "ipv4";
}), Gt = /*@__PURE__*/ t("$ZodIPv6", (e, t) => {
	t.pattern ??= qe, j.init(e, t), e._zod.bag.format = "ipv6", e._zod.check = (n) => {
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
}), Kt = /*@__PURE__*/ t("$ZodCIDRv4", (e, t) => {
	t.pattern ??= Je, j.init(e, t);
}), qt = /*@__PURE__*/ t("$ZodCIDRv6", (e, t) => {
	t.pattern ??= Ye, j.init(e, t), e._zod.check = (n) => {
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
function Jt(e) {
	if (e === "") return !0;
	if (/\s/.test(e) || e.length % 4 != 0) return !1;
	try {
		return atob(e), !0;
	} catch {
		return !1;
	}
}
var Yt = /*@__PURE__*/ t("$ZodBase64", (e, t) => {
	t.pattern ??= Xe, j.init(e, t), e._zod.bag.contentEncoding = "base64", e._zod.check = (n) => {
		Jt(n.value) || n.issues.push({
			code: "invalid_format",
			format: "base64",
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
});
function Xt(e) {
	if (!Ze.test(e)) return !1;
	let t = e.replace(/[-_]/g, (e) => e === "-" ? "+" : "/");
	return Jt(t.padEnd(Math.ceil(t.length / 4) * 4, "="));
}
var Zt = /*@__PURE__*/ t("$ZodBase64URL", (e, t) => {
	t.pattern ??= Ze, j.init(e, t), e._zod.bag.contentEncoding = "base64url", e._zod.check = (n) => {
		Xt(n.value) || n.issues.push({
			code: "invalid_format",
			format: "base64url",
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), Qt = /*@__PURE__*/ t("$ZodE164", (e, t) => {
	t.pattern ??= $e, j.init(e, t);
});
function $t(e, t = null) {
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
var en = /*@__PURE__*/ t("$ZodJWT", (e, t) => {
	j.init(e, t), e._zod.check = (n) => {
		$t(n.value, t.alg) || n.issues.push({
			code: "invalid_format",
			format: "jwt",
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), tn = /*@__PURE__*/ t("$ZodNumber", (e, t) => {
	A.init(e, t), e._zod.pattern = e._zod.bag.pattern ?? st, e._zod.parse = (n, r) => {
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
}), nn = /*@__PURE__*/ t("$ZodNumberFormat", (e, t) => {
	ht.init(e, t), tn.init(e, t);
}), rn = /*@__PURE__*/ t("$ZodBoolean", (e, t) => {
	A.init(e, t), e._zod.pattern = ct, e._zod.parse = (n, r) => {
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
}), an = /*@__PURE__*/ t("$ZodUnknown", (e, t) => {
	A.init(e, t), e._zod.parse = (e) => e;
}), on = /*@__PURE__*/ t("$ZodNever", (e, t) => {
	A.init(e, t), e._zod.parse = (t, n) => (t.issues.push({
		expected: "never",
		code: "invalid_type",
		input: t.value,
		inst: e
	}), t);
});
function sn(e, t, n) {
	e.issues.length && t.issues.push(...S(n, e.issues)), t.value[n] = e.value;
}
var cn = /*@__PURE__*/ t("$ZodArray", (e, t) => {
	A.init(e, t), e._zod.parse = (n, r) => {
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
			s instanceof Promise ? a.push(s.then((t) => sn(t, n, e))) : sn(s, n, e);
		}
		return a.length ? Promise.all(a).then(() => n) : n;
	};
});
function M(e, t, n, r, i, a) {
	let o = n in r;
	if (e.issues.length) {
		if (i && a && !o) return;
		t.issues.push(...S(n, e.issues));
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
	let n = oe(e.shape);
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
		a instanceof Promise ? e.push(a.then((e) => M(e, n, i, t, u, d))) : M(a, n, i, t, u, d);
	}
	return o.length && n.issues.push({
		code: "unrecognized_keys",
		keys: o,
		input: t,
		inst: a
	}), e.length ? Promise.all(e).then(() => n) : n;
}
var dn = /*@__PURE__*/ t("$ZodObject", (e, t) => {
	if (A.init(e, t), !Object.getOwnPropertyDescriptor(t, "shape")?.get) {
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
	let r = g, i = t.catchall, a;
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
			a instanceof Promise ? c.push(a.then((n) => M(n, t, e, s, r, i))) : M(a, t, e, s, r, i);
		}
		return i ? un(c, s, t, o, n.value, e) : c.length ? Promise.all(c).then(() => t) : t;
	};
}), fn = /*@__PURE__*/ t("$ZodObjectJIT", (e, t) => {
	dn.init(e, t);
	let n = e._zod.parse, r = c(() => ln(t)), a = (e) => {
		let t = new Et([
			"shape",
			"payload",
			"ctx"
		]), n = r.value, i = (e) => {
			let t = ee(e);
			return `shape[${t}]._zod.run({ value: input[${t}], issues: [] }, ctx)`;
		};
		t.write("const input = payload.value;");
		let a = Object.create(null), o = 0;
		for (let e of n.keys) a[e] = `key_${o++}`;
		t.write("const newResult = {};");
		for (let r of n.keys) {
			let n = a[r], o = ee(r), s = e[r], c = s?._zod?.optin === "optional", l = s?._zod?.optout === "optional";
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
	}, o, s = g, l = !i.jitless, u = l && re.value, d = t.catchall, f;
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
	let i = e.filter((e) => !x(e));
	return i.length === 1 ? (t.value = i[0].value, i[0]) : (t.issues.push({
		code: "invalid_union",
		input: t.value,
		inst: n,
		errors: e.map((e) => e.issues.map((e) => w(e, r, a())))
	}), t);
}
var mn = /*@__PURE__*/ t("$ZodUnion", (e, t) => {
	A.init(e, t), p(e._zod, "optin", () => t.options.some((e) => e._zod.optin === "optional") ? "optional" : void 0), p(e._zod, "optout", () => t.options.some((e) => e._zod.optout === "optional") ? "optional" : void 0), p(e._zod, "values", () => {
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
		if (!g(o)) return i.issues.push({
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
	A.init(e, t), e._zod.parse = (e, n) => {
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
	if (_(e) && _(t)) {
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
	}), x(e)) return e;
	let o = _n(t.value, n.value);
	if (!o.valid) throw Error(`Unmergable intersection. Error path: ${JSON.stringify(o.mergeErrorPath)}`);
	return e.value = o.data, e;
}
var yn = /*@__PURE__*/ t("$ZodRecord", (e, t) => {
	A.init(e, t), e._zod.parse = (n, r) => {
		let i = n.value;
		if (!_(i)) return n.issues.push({
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
						issues: s.issues.map((e) => w(e, r, a())),
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
					e.issues.length && n.issues.push(...S(l, e.issues)), n.value[u] = e.value;
				})) : (d.issues.length && n.issues.push(...S(l, d.issues)), n.value[u] = d.value);
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
				if (typeof s == "string" && st.test(s) && c.issues.length) {
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
						issues: c.issues.map((e) => w(e, r, a())),
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
					e.issues.length && n.issues.push(...S(s, e.issues)), n.value[c.value] = e.value;
				})) : (l.issues.length && n.issues.push(...S(s, l.issues)), n.value[c.value] = l.value);
			}
		}
		return o.length ? Promise.all(o).then(() => n) : n;
	};
}), bn = /*@__PURE__*/ t("$ZodEnum", (e, t) => {
	A.init(e, t);
	let n = o(t.entries), r = new Set(n);
	e._zod.values = r, e._zod.pattern = RegExp(`^(${n.filter((e) => ae.has(typeof e)).map((e) => typeof e == "string" ? v(e) : e.toString()).join("|")})$`), e._zod.parse = (t, i) => {
		let a = t.value;
		return r.has(a) || t.issues.push({
			code: "invalid_value",
			values: n,
			input: a,
			inst: e
		}), t;
	};
}), xn = /*@__PURE__*/ t("$ZodLiteral", (e, t) => {
	if (A.init(e, t), t.values.length === 0) throw Error("Cannot create literal schema with no valid values");
	let n = new Set(t.values);
	e._zod.values = n, e._zod.pattern = RegExp(`^(${t.values.map((e) => typeof e == "string" ? v(e) : e ? v(e.toString()) : String(e)).join("|")})$`), e._zod.parse = (r, i) => {
		let a = r.value;
		return n.has(a) || r.issues.push({
			code: "invalid_value",
			values: t.values,
			input: a,
			inst: e
		}), r;
	};
}), Sn = /*@__PURE__*/ t("$ZodTransform", (e, t) => {
	A.init(e, t), e._zod.optin = "optional", e._zod.parse = (i, a) => {
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
	A.init(e, t), e._zod.optin = "optional", e._zod.optout = "optional", p(e._zod, "values", () => t.innerType._zod.values ? /* @__PURE__ */ new Set([...t.innerType._zod.values, void 0]) : void 0), p(e._zod, "pattern", () => {
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
	A.init(e, t), p(e._zod, "optin", () => t.innerType._zod.optin), p(e._zod, "optout", () => t.innerType._zod.optout), p(e._zod, "pattern", () => {
		let e = t.innerType._zod.pattern;
		return e ? RegExp(`^(${u(e.source)}|null)$`) : void 0;
	}), p(e._zod, "values", () => t.innerType._zod.values ? /* @__PURE__ */ new Set([...t.innerType._zod.values, null]) : void 0), e._zod.parse = (e, n) => e.value === null ? e : t.innerType._zod.run(e, n);
}), Dn = /*@__PURE__*/ t("$ZodDefault", (e, t) => {
	A.init(e, t), e._zod.optin = "optional", p(e._zod, "values", () => t.innerType._zod.values), e._zod.parse = (e, n) => {
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
	A.init(e, t), e._zod.optin = "optional", p(e._zod, "values", () => t.innerType._zod.values), e._zod.parse = (e, n) => (n.direction === "backward" || e.value === void 0 && (e.value = t.defaultValue), t.innerType._zod.run(e, n));
}), An = /*@__PURE__*/ t("$ZodNonOptional", (e, t) => {
	A.init(e, t), p(e._zod, "values", () => {
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
	A.init(e, t), e._zod.optin = "optional", p(e._zod, "optout", () => t.innerType._zod.optout), p(e._zod, "values", () => t.innerType._zod.values), e._zod.parse = (e, n) => {
		if (n.direction === "backward") return t.innerType._zod.run(e, n);
		let r = t.innerType._zod.run(e, n);
		return r instanceof Promise ? r.then((r) => (e.value = r.value, r.issues.length && (e.value = t.catchValue({
			...e,
			error: { issues: r.issues.map((e) => w(e, n, a())) },
			input: e.value
		}), e.issues = [], e.fallback = !0), e)) : (e.value = r.value, r.issues.length && (e.value = t.catchValue({
			...e,
			error: { issues: r.issues.map((e) => w(e, n, a())) },
			input: e.value
		}), e.issues = [], e.fallback = !0), e);
	};
}), Nn = /*@__PURE__*/ t("$ZodPipe", (e, t) => {
	A.init(e, t), p(e._zod, "values", () => t.in._zod.values), p(e._zod, "optin", () => t.in._zod.optin), p(e._zod, "optout", () => t.out._zod.optout), p(e._zod, "propValues", () => t.in._zod.propValues), e._zod.parse = (e, n) => {
		if (n.direction === "backward") {
			let r = t.out._zod.run(e, n);
			return r instanceof Promise ? r.then((e) => N(e, t.in, n)) : N(r, t.in, n);
		}
		let r = t.in._zod.run(e, n);
		return r instanceof Promise ? r.then((e) => N(e, t.out, n)) : N(r, t.out, n);
	};
});
function N(e, t, n) {
	return e.issues.length ? (e.aborted = !0, e) : t._zod.run({
		value: e.value,
		issues: e.issues,
		fallback: e.fallback
	}, n);
}
var Pn = /*@__PURE__*/ t("$ZodReadonly", (e, t) => {
	A.init(e, t), p(e._zod, "propValues", () => t.innerType._zod.propValues), p(e._zod, "values", () => t.innerType._zod.values), p(e._zod, "optin", () => t.innerType?._zod?.optin), p(e._zod, "optout", () => t.innerType?._zod?.optout), e._zod.parse = (e, n) => {
		if (n.direction === "backward") return t.innerType._zod.run(e, n);
		let r = t.innerType._zod.run(e, n);
		return r instanceof Promise ? r.then(Fn) : Fn(r);
	};
});
function Fn(e) {
	return e.value = Object.freeze(e.value), e;
}
var In = /*@__PURE__*/ t("$ZodCustom", (e, t) => {
	O.init(e, t), A.init(e, t), e._zod.parse = (e, t) => e, e._zod.check = (n) => {
		let r = n.value, i = t.fn(r);
		if (i instanceof Promise) return i.then((t) => Ln(t, n, r, e));
		Ln(i, n, r, e);
	};
});
function Ln(e, t, n, r) {
	if (!e) {
		let e = {
			code: "custom",
			input: n,
			inst: r,
			path: [...r._zod.def.path ?? []],
			continue: !r._zod.def.abort
		};
		r._zod.def.params && (e.params = r._zod.def.params), t.issues.push(T(e));
	}
}
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/registries.js
var Rn, zn = class {
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
function Bn() {
	return new zn();
}
(Rn = globalThis).__zod_globalRegistry ?? (Rn.__zod_globalRegistry = Bn());
var P = globalThis.__zod_globalRegistry;
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/api.js
// @__NO_SIDE_EFFECTS__
function Vn(e, t) {
	return new e({
		type: "string",
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Hn(e, t) {
	return new e({
		type: "string",
		format: "email",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Un(e, t) {
	return new e({
		type: "string",
		format: "guid",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Wn(e, t) {
	return new e({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Gn(e, t) {
	return new e({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: !1,
		version: "v4",
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Kn(e, t) {
	return new e({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: !1,
		version: "v6",
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function qn(e, t) {
	return new e({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: !1,
		version: "v7",
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Jn(e, t) {
	return new e({
		type: "string",
		format: "url",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Yn(e, t) {
	return new e({
		type: "string",
		format: "emoji",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Xn(e, t) {
	return new e({
		type: "string",
		format: "nanoid",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Zn(e, t) {
	return new e({
		type: "string",
		format: "cuid",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Qn(e, t) {
	return new e({
		type: "string",
		format: "cuid2",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function $n(e, t) {
	return new e({
		type: "string",
		format: "ulid",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function er(e, t) {
	return new e({
		type: "string",
		format: "xid",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function tr(e, t) {
	return new e({
		type: "string",
		format: "ksuid",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function nr(e, t) {
	return new e({
		type: "string",
		format: "ipv4",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function rr(e, t) {
	return new e({
		type: "string",
		format: "ipv6",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function ir(e, t) {
	return new e({
		type: "string",
		format: "cidrv4",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function ar(e, t) {
	return new e({
		type: "string",
		format: "cidrv6",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function or(e, t) {
	return new e({
		type: "string",
		format: "base64",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function sr(e, t) {
	return new e({
		type: "string",
		format: "base64url",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function cr(e, t) {
	return new e({
		type: "string",
		format: "e164",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function lr(e, t) {
	return new e({
		type: "string",
		format: "jwt",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function ur(e, t) {
	return new e({
		type: "string",
		format: "datetime",
		check: "string_format",
		offset: !1,
		local: !1,
		precision: null,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function dr(e, t) {
	return new e({
		type: "string",
		format: "date",
		check: "string_format",
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function fr(e, t) {
	return new e({
		type: "string",
		format: "time",
		check: "string_format",
		precision: null,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function pr(e, t) {
	return new e({
		type: "string",
		format: "duration",
		check: "string_format",
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function mr(e, t) {
	return new e({
		type: "number",
		checks: [],
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function hr(e, t) {
	return new e({
		type: "number",
		check: "number_format",
		abort: !1,
		format: "safeint",
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function gr(e, t) {
	return new e({
		type: "boolean",
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function _r(e) {
	return new e({ type: "unknown" });
}
// @__NO_SIDE_EFFECTS__
function vr(e, t) {
	return new e({
		type: "never",
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function yr(e, t) {
	return new ft({
		check: "less_than",
		...b(t),
		value: e,
		inclusive: !1
	});
}
// @__NO_SIDE_EFFECTS__
function br(e, t) {
	return new ft({
		check: "less_than",
		...b(t),
		value: e,
		inclusive: !0
	});
}
// @__NO_SIDE_EFFECTS__
function xr(e, t) {
	return new pt({
		check: "greater_than",
		...b(t),
		value: e,
		inclusive: !1
	});
}
// @__NO_SIDE_EFFECTS__
function Sr(e, t) {
	return new pt({
		check: "greater_than",
		...b(t),
		value: e,
		inclusive: !0
	});
}
// @__NO_SIDE_EFFECTS__
function Cr(e, t) {
	return new mt({
		check: "multiple_of",
		...b(t),
		value: e
	});
}
// @__NO_SIDE_EFFECTS__
function wr(e, t) {
	return new gt({
		check: "max_length",
		...b(t),
		maximum: e
	});
}
// @__NO_SIDE_EFFECTS__
function F(e, t) {
	return new _t({
		check: "min_length",
		...b(t),
		minimum: e
	});
}
// @__NO_SIDE_EFFECTS__
function Tr(e, t) {
	return new vt({
		check: "length_equals",
		...b(t),
		length: e
	});
}
// @__NO_SIDE_EFFECTS__
function Er(e, t) {
	return new yt({
		check: "string_format",
		format: "regex",
		...b(t),
		pattern: e
	});
}
// @__NO_SIDE_EFFECTS__
function Dr(e) {
	return new bt({
		check: "string_format",
		format: "lowercase",
		...b(e)
	});
}
// @__NO_SIDE_EFFECTS__
function Or(e) {
	return new xt({
		check: "string_format",
		format: "uppercase",
		...b(e)
	});
}
// @__NO_SIDE_EFFECTS__
function kr(e, t) {
	return new St({
		check: "string_format",
		format: "includes",
		...b(t),
		includes: e
	});
}
// @__NO_SIDE_EFFECTS__
function Ar(e, t) {
	return new Ct({
		check: "string_format",
		format: "starts_with",
		...b(t),
		prefix: e
	});
}
// @__NO_SIDE_EFFECTS__
function jr(e, t) {
	return new wt({
		check: "string_format",
		format: "ends_with",
		...b(t),
		suffix: e
	});
}
// @__NO_SIDE_EFFECTS__
function I(e) {
	return new Tt({
		check: "overwrite",
		tx: e
	});
}
// @__NO_SIDE_EFFECTS__
function Mr(e) {
	return /* @__PURE__ */ I((t) => t.normalize(e));
}
// @__NO_SIDE_EFFECTS__
function Nr() {
	return /* @__PURE__ */ I((e) => e.trim());
}
// @__NO_SIDE_EFFECTS__
function Pr() {
	return /* @__PURE__ */ I((e) => e.toLowerCase());
}
// @__NO_SIDE_EFFECTS__
function Fr() {
	return /* @__PURE__ */ I((e) => e.toUpperCase());
}
// @__NO_SIDE_EFFECTS__
function Ir() {
	return /* @__PURE__ */ I((e) => te(e));
}
// @__NO_SIDE_EFFECTS__
function Lr(e, t, n) {
	return new e({
		type: "array",
		element: t,
		...b(n)
	});
}
// @__NO_SIDE_EFFECTS__
function Rr(e, t, n) {
	return new e({
		type: "custom",
		check: "custom",
		fn: t,
		...b(n)
	});
}
// @__NO_SIDE_EFFECTS__
function zr(e, t) {
	let n = /* @__PURE__ */ Br((t) => (t.addIssue = (e) => {
		if (typeof e == "string") t.issues.push(T(e, t.value, n._zod.def));
		else {
			let r = e;
			r.fatal && (r.continue = !1), r.code ??= "custom", r.input ??= t.value, r.inst ??= n, r.continue ??= !n._zod.def.abort, t.issues.push(T(r));
		}
	}, e(t.value, t)), t);
	return n;
}
// @__NO_SIDE_EFFECTS__
function Br(e, t) {
	let n = new O({
		check: "custom",
		...b(t)
	});
	return n._zod.check = e, n;
}
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/to-json-schema.js
function Vr(e) {
	let t = e?.target ?? "draft-2020-12";
	return t === "draft-4" && (t = "draft-04"), t === "draft-7" && (t = "draft-07"), {
		processors: e.processors ?? {},
		metadataRegistry: e?.metadata ?? P,
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
function L(e, t, n = {
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
		a && (o.ref ||= a, L(a, t, r), t.seen.get(a).isParent = !0);
	}
	let c = t.metadataRegistry.get(e);
	return c && Object.assign(o.schema, c), t.io === "input" && R(e) && (delete o.schema.examples, delete o.schema.default), t.io === "input" && "_prefault" in o.schema && ((r = o.schema).default ?? (r.default = o.schema._prefault)), delete o.schema._prefault, t.seen.get(e).schema;
}
function Hr(e, t) {
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
function Ur(e, t) {
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
					input: z(t, "input", e.processors),
					output: z(t, "output", e.processors)
				}
			},
			enumerable: !1,
			writable: !1
		}), n;
	} catch {
		throw Error("Error converting schema to JSON.");
	}
}
function R(e, t) {
	let n = t ?? { seen: /* @__PURE__ */ new Set() };
	if (n.seen.has(e)) return !1;
	n.seen.add(e);
	let r = e._zod.def;
	if (r.type === "transform") return !0;
	if (r.type === "array") return R(r.element, n);
	if (r.type === "set") return R(r.valueType, n);
	if (r.type === "lazy") return R(r.getter(), n);
	if (r.type === "promise" || r.type === "optional" || r.type === "nonoptional" || r.type === "nullable" || r.type === "readonly" || r.type === "default" || r.type === "prefault") return R(r.innerType, n);
	if (r.type === "intersection") return R(r.left, n) || R(r.right, n);
	if (r.type === "record" || r.type === "map") return R(r.keyType, n) || R(r.valueType, n);
	if (r.type === "pipe") return e._zod.traits.has("$ZodCodec") ? !0 : R(r.in, n) || R(r.out, n);
	if (r.type === "object") {
		for (let e in r.shape) if (R(r.shape[e], n)) return !0;
		return !1;
	}
	if (r.type === "union") {
		for (let e of r.options) if (R(e, n)) return !0;
		return !1;
	}
	if (r.type === "tuple") {
		for (let e of r.items) if (R(e, n)) return !0;
		return !!(r.rest && R(r.rest, n));
	}
	return !1;
}
var Wr = (e, t = {}) => (n) => {
	let r = Vr({
		...n,
		processors: t
	});
	return L(e, r), Hr(r, e), Ur(r, e);
}, z = (e, t, n = {}) => (r) => {
	let { libraryOptions: i, target: a } = r ?? {}, o = Vr({
		...i ?? {},
		target: a,
		io: t,
		processors: n
	});
	return L(e, o), Hr(o, e), Ur(o, e);
}, Gr = {
	guid: "uuid",
	url: "uri",
	datetime: "date-time",
	json_string: "json-string",
	regex: ""
}, Kr = (e, t, n, r) => {
	let i = n;
	i.type = "string";
	let { minimum: a, maximum: o, format: s, patterns: c, contentEncoding: l } = e._zod.bag;
	if (typeof a == "number" && (i.minLength = a), typeof o == "number" && (i.maxLength = o), s && (i.format = Gr[s] ?? s, i.format === "" && delete i.format, s === "time" && delete i.format), l && (i.contentEncoding = l), c && c.size > 0) {
		let e = [...c];
		e.length === 1 ? i.pattern = e[0].source : e.length > 1 && (i.allOf = [...e.map((e) => ({
			...t.target === "draft-07" || t.target === "draft-04" || t.target === "openapi-3.0" ? { type: "string" } : {},
			pattern: e.source
		}))]);
	}
}, qr = (e, t, n, r) => {
	let i = n, { minimum: a, maximum: o, format: s, multipleOf: c, exclusiveMaximum: l, exclusiveMinimum: u } = e._zod.bag;
	typeof s == "string" && s.includes("int") ? i.type = "integer" : i.type = "number";
	let d = typeof u == "number" && u >= (a ?? -Infinity), f = typeof l == "number" && l <= (o ?? Infinity), p = t.target === "draft-04" || t.target === "openapi-3.0";
	d ? p ? (i.minimum = u, i.exclusiveMinimum = !0) : i.exclusiveMinimum = u : typeof a == "number" && (i.minimum = a), f ? p ? (i.maximum = l, i.exclusiveMaximum = !0) : i.exclusiveMaximum = l : typeof o == "number" && (i.maximum = o), typeof c == "number" && (i.multipleOf = c);
}, Jr = (e, t, n, r) => {
	n.type = "boolean";
}, Yr = (e, t, n, r) => {
	n.not = {};
}, Xr = (e, t, n, r) => {
	let i = e._zod.def, a = o(i.entries);
	a.every((e) => typeof e == "number") && (n.type = "number"), a.every((e) => typeof e == "string") && (n.type = "string"), n.enum = a;
}, Zr = (e, t, n, r) => {
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
}, Qr = (e, t, n, r) => {
	if (t.unrepresentable === "throw") throw Error("Custom types cannot be represented in JSON Schema");
}, $r = (e, t, n, r) => {
	if (t.unrepresentable === "throw") throw Error("Transforms cannot be represented in JSON Schema");
}, ei = (e, t, n, r) => {
	let i = n, a = e._zod.def, { minimum: o, maximum: s } = e._zod.bag;
	typeof o == "number" && (i.minItems = o), typeof s == "number" && (i.maxItems = s), i.type = "array", i.items = L(a.element, t, {
		...r,
		path: [...r.path, "items"]
	});
}, ti = (e, t, n, r) => {
	let i = n, a = e._zod.def;
	i.type = "object", i.properties = {};
	let o = a.shape;
	for (let e in o) i.properties[e] = L(o[e], t, {
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
	c.size > 0 && (i.required = Array.from(c)), a.catchall?._zod.def.type === "never" ? i.additionalProperties = !1 : a.catchall ? a.catchall && (i.additionalProperties = L(a.catchall, t, {
		...r,
		path: [...r.path, "additionalProperties"]
	})) : t.io === "output" && (i.additionalProperties = !1);
}, ni = (e, t, n, r) => {
	let i = e._zod.def, a = i.inclusive === !1, o = i.options.map((e, n) => L(e, t, {
		...r,
		path: [
			...r.path,
			a ? "oneOf" : "anyOf",
			n
		]
	}));
	a ? n.oneOf = o : n.anyOf = o;
}, ri = (e, t, n, r) => {
	let i = e._zod.def, a = L(i.left, t, {
		...r,
		path: [
			...r.path,
			"allOf",
			0
		]
	}), o = L(i.right, t, {
		...r,
		path: [
			...r.path,
			"allOf",
			1
		]
	}), s = (e) => "allOf" in e && Object.keys(e).length === 1;
	n.allOf = [...s(a) ? a.allOf : [a], ...s(o) ? o.allOf : [o]];
}, ii = (e, t, n, r) => {
	let i = n, a = e._zod.def;
	i.type = "object";
	let o = a.keyType, s = o._zod.bag?.patterns;
	if (a.mode === "loose" && s && s.size > 0) {
		let e = L(a.valueType, t, {
			...r,
			path: [
				...r.path,
				"patternProperties",
				"*"
			]
		});
		i.patternProperties = {};
		for (let t of s) i.patternProperties[t.source] = e;
	} else (t.target === "draft-07" || t.target === "draft-2020-12") && (i.propertyNames = L(a.keyType, t, {
		...r,
		path: [...r.path, "propertyNames"]
	})), i.additionalProperties = L(a.valueType, t, {
		...r,
		path: [...r.path, "additionalProperties"]
	});
	let c = o._zod.values;
	if (c) {
		let e = [...c].filter((e) => typeof e == "string" || typeof e == "number");
		e.length > 0 && (i.required = e);
	}
}, ai = (e, t, n, r) => {
	let i = e._zod.def, a = L(i.innerType, t, r), o = t.seen.get(e);
	t.target === "openapi-3.0" ? (o.ref = i.innerType, n.nullable = !0) : n.anyOf = [a, { type: "null" }];
}, oi = (e, t, n, r) => {
	let i = e._zod.def;
	L(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType;
}, si = (e, t, n, r) => {
	let i = e._zod.def;
	L(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType, n.default = JSON.parse(JSON.stringify(i.defaultValue));
}, ci = (e, t, n, r) => {
	let i = e._zod.def;
	L(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType, t.io === "input" && (n._prefault = JSON.parse(JSON.stringify(i.defaultValue)));
}, li = (e, t, n, r) => {
	let i = e._zod.def;
	L(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType;
	let o;
	try {
		o = i.catchValue(void 0);
	} catch {
		throw Error("Dynamic catch values are not supported in JSON Schema");
	}
	n.default = o;
}, ui = (e, t, n, r) => {
	let i = e._zod.def, a = i.in._zod.traits.has("$ZodTransform"), o = t.io === "input" ? a ? i.out : i.in : i.out;
	L(o, t, r);
	let s = t.seen.get(e);
	s.ref = o;
}, di = (e, t, n, r) => {
	let i = e._zod.def;
	L(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType, n.readOnly = !0;
}, fi = (e, t, n, r) => {
	let i = e._zod.def;
	L(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType;
}, pi = /*@__PURE__*/ t("ZodISODateTime", (e, t) => {
	Bt.init(e, t), W.init(e, t);
});
function mi(e) {
	return /* @__PURE__ */ ur(pi, e);
}
var hi = /*@__PURE__*/ t("ZodISODate", (e, t) => {
	Vt.init(e, t), W.init(e, t);
});
function gi(e) {
	return /* @__PURE__ */ dr(hi, e);
}
var _i = /*@__PURE__*/ t("ZodISOTime", (e, t) => {
	Ht.init(e, t), W.init(e, t);
});
function vi(e) {
	return /* @__PURE__ */ fr(_i, e);
}
var yi = /*@__PURE__*/ t("ZodISODuration", (e, t) => {
	Ut.init(e, t), W.init(e, t);
});
function bi(e) {
	return /* @__PURE__ */ pr(yi, e);
}
var B = /*@__PURE__*/ t("ZodError", (e, t) => {
	ve.init(e, t), e.name = "ZodError", Object.defineProperties(e, {
		format: { value: (t) => xe(e, t) },
		flatten: { value: (t) => be(e, t) },
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
}, { Parent: Error }), xi = /* @__PURE__ */ Se(B), Si = /* @__PURE__ */ Ce(B), Ci = /* @__PURE__ */ E(B), wi = /* @__PURE__ */ D(B), Ti = /* @__PURE__ */ Ee(B), Ei = /* @__PURE__ */ De(B), Di = /* @__PURE__ */ Oe(B), Oi = /* @__PURE__ */ ke(B), ki = /* @__PURE__ */ Ae(B), Ai = /* @__PURE__ */ je(B), ji = /* @__PURE__ */ Me(B), Mi = /* @__PURE__ */ Ne(B), Ni = /* @__PURE__ */ new WeakMap();
function V(e, t, n) {
	let r = Object.getPrototypeOf(e), i = Ni.get(r);
	if (i || (i = /* @__PURE__ */ new Set(), Ni.set(r, i)), !i.has(t)) {
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
var H = /*@__PURE__*/ t("ZodType", (e, t) => (A.init(e, t), Object.assign(e["~standard"], { jsonSchema: {
	input: z(e, "input"),
	output: z(e, "output")
} }), e.toJSONSchema = Wr(e, {}), e.def = t, e.type = t.type, Object.defineProperty(e, "_def", { value: t }), e.parse = (t, n) => xi(e, t, n, { callee: e.parse }), e.safeParse = (t, n) => Ci(e, t, n), e.parseAsync = async (t, n) => Si(e, t, n, { callee: e.parseAsync }), e.safeParseAsync = async (t, n) => wi(e, t, n), e.spa = e.safeParseAsync, e.encode = (t, n) => Ti(e, t, n), e.decode = (t, n) => Ei(e, t, n), e.encodeAsync = async (t, n) => Di(e, t, n), e.decodeAsync = async (t, n) => Oi(e, t, n), e.safeEncode = (t, n) => ki(e, t, n), e.safeDecode = (t, n) => Ai(e, t, n), e.safeEncodeAsync = async (t, n) => ji(e, t, n), e.safeDecodeAsync = async (t, n) => Mi(e, t, n), V(e, "ZodType", {
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
		return y(this, e, t);
	},
	brand() {
		return this;
	},
	register(e, t) {
		return e.add(this, t), this;
	},
	refine(e, t) {
		return this.check(Ha(e, t));
	},
	superRefine(e, t) {
		return this.check(Ua(e, t));
	},
	overwrite(e) {
		return this.check(/* @__PURE__ */ I(e));
	},
	optional() {
		return wa(this);
	},
	exactOptional() {
		return Ea(this);
	},
	nullable() {
		return Oa(this);
	},
	nullish() {
		return wa(Oa(this));
	},
	nonoptional(e) {
		return Pa(this, e);
	},
	array() {
		return q(this);
	},
	or(e) {
		return fa([this, e]);
	},
	and(e) {
		return ga(this, e);
	},
	transform(e) {
		return Ra(this, Sa(e));
	},
	default(e) {
		return Aa(this, e);
	},
	prefault(e) {
		return Ma(this, e);
	},
	catch(e) {
		return Ia(this, e);
	},
	pipe(e) {
		return Ra(this, e);
	},
	readonly() {
		return Ba(this);
	},
	describe(e) {
		let t = this.clone();
		return P.add(t, { description: e }), t;
	},
	meta(...e) {
		if (e.length === 0) return P.get(this);
		let t = this.clone();
		return P.add(t, e[0]), t;
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
		return P.get(e)?.description;
	},
	configurable: !0
}), e)), Pi = /*@__PURE__*/ t("_ZodString", (e, t) => {
	Ot.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => Kr(e, t, n, r);
	let n = e._zod.bag;
	e.format = n.format ?? null, e.minLength = n.minimum ?? null, e.maxLength = n.maximum ?? null, V(e, "_ZodString", {
		regex(...e) {
			return this.check(/* @__PURE__ */ Er(...e));
		},
		includes(...e) {
			return this.check(/* @__PURE__ */ kr(...e));
		},
		startsWith(...e) {
			return this.check(/* @__PURE__ */ Ar(...e));
		},
		endsWith(...e) {
			return this.check(/* @__PURE__ */ jr(...e));
		},
		min(...e) {
			return this.check(/* @__PURE__ */ F(...e));
		},
		max(...e) {
			return this.check(/* @__PURE__ */ wr(...e));
		},
		length(...e) {
			return this.check(/* @__PURE__ */ Tr(...e));
		},
		nonempty(...e) {
			return this.check(/* @__PURE__ */ F(1, ...e));
		},
		lowercase(e) {
			return this.check(/* @__PURE__ */ Dr(e));
		},
		uppercase(e) {
			return this.check(/* @__PURE__ */ Or(e));
		},
		trim() {
			return this.check(/* @__PURE__ */ Nr());
		},
		normalize(...e) {
			return this.check(/* @__PURE__ */ Mr(...e));
		},
		toLowerCase() {
			return this.check(/* @__PURE__ */ Pr());
		},
		toUpperCase() {
			return this.check(/* @__PURE__ */ Fr());
		},
		slugify() {
			return this.check(/* @__PURE__ */ Ir());
		}
	});
}), Fi = /*@__PURE__*/ t("ZodString", (e, t) => {
	Ot.init(e, t), Pi.init(e, t), e.email = (t) => e.check(/* @__PURE__ */ Hn(Ii, t)), e.url = (t) => e.check(/* @__PURE__ */ Jn(Ri, t)), e.jwt = (t) => e.check(/* @__PURE__ */ lr($i, t)), e.emoji = (t) => e.check(/* @__PURE__ */ Yn(zi, t)), e.guid = (t) => e.check(/* @__PURE__ */ Un(Li, t)), e.uuid = (t) => e.check(/* @__PURE__ */ Wn(G, t)), e.uuidv4 = (t) => e.check(/* @__PURE__ */ Gn(G, t)), e.uuidv6 = (t) => e.check(/* @__PURE__ */ Kn(G, t)), e.uuidv7 = (t) => e.check(/* @__PURE__ */ qn(G, t)), e.nanoid = (t) => e.check(/* @__PURE__ */ Xn(Bi, t)), e.guid = (t) => e.check(/* @__PURE__ */ Un(Li, t)), e.cuid = (t) => e.check(/* @__PURE__ */ Zn(Vi, t)), e.cuid2 = (t) => e.check(/* @__PURE__ */ Qn(Hi, t)), e.ulid = (t) => e.check(/* @__PURE__ */ $n(Ui, t)), e.base64 = (t) => e.check(/* @__PURE__ */ or(Xi, t)), e.base64url = (t) => e.check(/* @__PURE__ */ sr(Zi, t)), e.xid = (t) => e.check(/* @__PURE__ */ er(Wi, t)), e.ksuid = (t) => e.check(/* @__PURE__ */ tr(Gi, t)), e.ipv4 = (t) => e.check(/* @__PURE__ */ nr(Ki, t)), e.ipv6 = (t) => e.check(/* @__PURE__ */ rr(qi, t)), e.cidrv4 = (t) => e.check(/* @__PURE__ */ ir(Ji, t)), e.cidrv6 = (t) => e.check(/* @__PURE__ */ ar(Yi, t)), e.e164 = (t) => e.check(/* @__PURE__ */ cr(Qi, t)), e.datetime = (t) => e.check(mi(t)), e.date = (t) => e.check(gi(t)), e.time = (t) => e.check(vi(t)), e.duration = (t) => e.check(bi(t));
});
function U(e) {
	return /* @__PURE__ */ Vn(Fi, e);
}
var W = /*@__PURE__*/ t("ZodStringFormat", (e, t) => {
	j.init(e, t), Pi.init(e, t);
}), Ii = /*@__PURE__*/ t("ZodEmail", (e, t) => {
	jt.init(e, t), W.init(e, t);
}), Li = /*@__PURE__*/ t("ZodGUID", (e, t) => {
	kt.init(e, t), W.init(e, t);
}), G = /*@__PURE__*/ t("ZodUUID", (e, t) => {
	At.init(e, t), W.init(e, t);
}), Ri = /*@__PURE__*/ t("ZodURL", (e, t) => {
	Mt.init(e, t), W.init(e, t);
}), zi = /*@__PURE__*/ t("ZodEmoji", (e, t) => {
	Nt.init(e, t), W.init(e, t);
}), Bi = /*@__PURE__*/ t("ZodNanoID", (e, t) => {
	Pt.init(e, t), W.init(e, t);
}), Vi = /*@__PURE__*/ t("ZodCUID", (e, t) => {
	Ft.init(e, t), W.init(e, t);
}), Hi = /*@__PURE__*/ t("ZodCUID2", (e, t) => {
	It.init(e, t), W.init(e, t);
}), Ui = /*@__PURE__*/ t("ZodULID", (e, t) => {
	Lt.init(e, t), W.init(e, t);
}), Wi = /*@__PURE__*/ t("ZodXID", (e, t) => {
	Rt.init(e, t), W.init(e, t);
}), Gi = /*@__PURE__*/ t("ZodKSUID", (e, t) => {
	zt.init(e, t), W.init(e, t);
}), Ki = /*@__PURE__*/ t("ZodIPv4", (e, t) => {
	Wt.init(e, t), W.init(e, t);
}), qi = /*@__PURE__*/ t("ZodIPv6", (e, t) => {
	Gt.init(e, t), W.init(e, t);
}), Ji = /*@__PURE__*/ t("ZodCIDRv4", (e, t) => {
	Kt.init(e, t), W.init(e, t);
}), Yi = /*@__PURE__*/ t("ZodCIDRv6", (e, t) => {
	qt.init(e, t), W.init(e, t);
}), Xi = /*@__PURE__*/ t("ZodBase64", (e, t) => {
	Yt.init(e, t), W.init(e, t);
}), Zi = /*@__PURE__*/ t("ZodBase64URL", (e, t) => {
	Zt.init(e, t), W.init(e, t);
}), Qi = /*@__PURE__*/ t("ZodE164", (e, t) => {
	Qt.init(e, t), W.init(e, t);
}), $i = /*@__PURE__*/ t("ZodJWT", (e, t) => {
	en.init(e, t), W.init(e, t);
}), ea = /*@__PURE__*/ t("ZodNumber", (e, t) => {
	tn.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => qr(e, t, n, r), V(e, "ZodNumber", {
		gt(e, t) {
			return this.check(/* @__PURE__ */ xr(e, t));
		},
		gte(e, t) {
			return this.check(/* @__PURE__ */ Sr(e, t));
		},
		min(e, t) {
			return this.check(/* @__PURE__ */ Sr(e, t));
		},
		lt(e, t) {
			return this.check(/* @__PURE__ */ yr(e, t));
		},
		lte(e, t) {
			return this.check(/* @__PURE__ */ br(e, t));
		},
		max(e, t) {
			return this.check(/* @__PURE__ */ br(e, t));
		},
		int(e) {
			return this.check(na(e));
		},
		safe(e) {
			return this.check(na(e));
		},
		positive(e) {
			return this.check(/* @__PURE__ */ xr(0, e));
		},
		nonnegative(e) {
			return this.check(/* @__PURE__ */ Sr(0, e));
		},
		negative(e) {
			return this.check(/* @__PURE__ */ yr(0, e));
		},
		nonpositive(e) {
			return this.check(/* @__PURE__ */ br(0, e));
		},
		multipleOf(e, t) {
			return this.check(/* @__PURE__ */ Cr(e, t));
		},
		step(e, t) {
			return this.check(/* @__PURE__ */ Cr(e, t));
		},
		finite() {
			return this;
		}
	});
	let n = e._zod.bag;
	e.minValue = Math.max(n.minimum ?? -Infinity, n.exclusiveMinimum ?? -Infinity) ?? null, e.maxValue = Math.min(n.maximum ?? Infinity, n.exclusiveMaximum ?? Infinity) ?? null, e.isInt = (n.format ?? "").includes("int") || Number.isSafeInteger(n.multipleOf ?? .5), e.isFinite = !0, e.format = n.format ?? null;
});
function K(e) {
	return /* @__PURE__ */ mr(ea, e);
}
var ta = /*@__PURE__*/ t("ZodNumberFormat", (e, t) => {
	nn.init(e, t), ea.init(e, t);
});
function na(e) {
	return /* @__PURE__ */ hr(ta, e);
}
var ra = /*@__PURE__*/ t("ZodBoolean", (e, t) => {
	rn.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => Jr(e, t, n, r);
});
function ia(e) {
	return /* @__PURE__ */ gr(ra, e);
}
var aa = /*@__PURE__*/ t("ZodUnknown", (e, t) => {
	an.init(e, t), H.init(e, t), e._zod.processJSONSchema = (e, t, n) => void 0;
});
function oa() {
	return /* @__PURE__ */ _r(aa);
}
var sa = /*@__PURE__*/ t("ZodNever", (e, t) => {
	on.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => Yr(e, t, n, r);
});
function ca(e) {
	return /* @__PURE__ */ vr(sa, e);
}
var la = /*@__PURE__*/ t("ZodArray", (e, t) => {
	cn.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => ei(e, t, n, r), e.element = t.element, V(e, "ZodArray", {
		min(e, t) {
			return this.check(/* @__PURE__ */ F(e, t));
		},
		nonempty(e) {
			return this.check(/* @__PURE__ */ F(1, e));
		},
		max(e, t) {
			return this.check(/* @__PURE__ */ wr(e, t));
		},
		length(e, t) {
			return this.check(/* @__PURE__ */ Tr(e, t));
		},
		unwrap() {
			return this.element;
		}
	});
});
function q(e, t) {
	return /* @__PURE__ */ Lr(la, e, t);
}
var ua = /*@__PURE__*/ t("ZodObject", (e, t) => {
	fn.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => ti(e, t, n, r), p(e, "shape", () => t.shape), V(e, "ZodObject", {
		keyof() {
			return Y(Object.keys(this._zod.def.shape));
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
				catchall: oa()
			});
		},
		loose() {
			return this.clone({
				...this._zod.def,
				catchall: oa()
			});
		},
		strict() {
			return this.clone({
				...this._zod.def,
				catchall: ca()
			});
		},
		strip() {
			return this.clone({
				...this._zod.def,
				catchall: void 0
			});
		},
		extend(e) {
			return ue(this, e);
		},
		safeExtend(e) {
			return de(this, e);
		},
		merge(e) {
			return fe(this, e);
		},
		pick(e) {
			return ce(this, e);
		},
		omit(e) {
			return le(this, e);
		},
		partial(...e) {
			return pe(Ca, this, e[0]);
		},
		required(...e) {
			return me(Na, this, e[0]);
		}
	});
});
function J(e, t) {
	return new ua({
		type: "object",
		shape: e ?? {},
		...b(t)
	});
}
var da = /*@__PURE__*/ t("ZodUnion", (e, t) => {
	mn.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => ni(e, t, n, r), e.options = t.options;
});
function fa(e, t) {
	return new da({
		type: "union",
		options: e,
		...b(t)
	});
}
var pa = /*@__PURE__*/ t("ZodDiscriminatedUnion", (e, t) => {
	da.init(e, t), hn.init(e, t);
});
function ma(e, t, n) {
	return new pa({
		type: "union",
		options: t,
		discriminator: e,
		...b(n)
	});
}
var ha = /*@__PURE__*/ t("ZodIntersection", (e, t) => {
	gn.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => ri(e, t, n, r);
});
function ga(e, t) {
	return new ha({
		type: "intersection",
		left: e,
		right: t
	});
}
var _a = /*@__PURE__*/ t("ZodRecord", (e, t) => {
	yn.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => ii(e, t, n, r), e.keyType = t.keyType, e.valueType = t.valueType;
});
function va(e, t, n) {
	return !t || !t._zod ? new _a({
		type: "record",
		keyType: U(),
		valueType: e,
		...b(t)
	}) : new _a({
		type: "record",
		keyType: e,
		valueType: t,
		...b(n)
	});
}
var ya = /*@__PURE__*/ t("ZodEnum", (e, t) => {
	bn.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => Xr(e, t, n, r), e.enum = t.entries, e.options = Object.values(t.entries);
	let n = new Set(Object.keys(t.entries));
	e.extract = (e, r) => {
		let i = {};
		for (let r of e) if (n.has(r)) i[r] = t.entries[r];
		else throw Error(`Key ${r} not found in enum`);
		return new ya({
			...t,
			checks: [],
			...b(r),
			entries: i
		});
	}, e.exclude = (e, r) => {
		let i = { ...t.entries };
		for (let t of e) if (n.has(t)) delete i[t];
		else throw Error(`Key ${t} not found in enum`);
		return new ya({
			...t,
			checks: [],
			...b(r),
			entries: i
		});
	};
});
function Y(e, t) {
	return new ya({
		type: "enum",
		entries: Array.isArray(e) ? Object.fromEntries(e.map((e) => [e, e])) : e,
		...b(t)
	});
}
var ba = /*@__PURE__*/ t("ZodLiteral", (e, t) => {
	xn.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => Zr(e, t, n, r), e.values = new Set(t.values), Object.defineProperty(e, "value", { get() {
		if (t.values.length > 1) throw Error("This schema contains multiple valid literal values. Use `.values` instead.");
		return t.values[0];
	} });
});
function X(e, t) {
	return new ba({
		type: "literal",
		values: Array.isArray(e) ? e : [e],
		...b(t)
	});
}
var xa = /*@__PURE__*/ t("ZodTransform", (e, t) => {
	Sn.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => $r(e, t, n, r), e._zod.parse = (n, i) => {
		if (i.direction === "backward") throw new r(e.constructor.name);
		n.addIssue = (r) => {
			if (typeof r == "string") n.issues.push(T(r, n.value, t));
			else {
				let t = r;
				t.fatal && (t.continue = !1), t.code ??= "custom", t.input ??= n.value, t.inst ??= e, n.issues.push(T(t));
			}
		};
		let a = t.transform(n.value, n);
		return a instanceof Promise ? a.then((e) => (n.value = e, n.fallback = !0, n)) : (n.value = a, n.fallback = !0, n);
	};
});
function Sa(e) {
	return new xa({
		type: "transform",
		transform: e
	});
}
var Ca = /*@__PURE__*/ t("ZodOptional", (e, t) => {
	wn.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => fi(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function wa(e) {
	return new Ca({
		type: "optional",
		innerType: e
	});
}
var Ta = /*@__PURE__*/ t("ZodExactOptional", (e, t) => {
	Tn.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => fi(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function Ea(e) {
	return new Ta({
		type: "optional",
		innerType: e
	});
}
var Da = /*@__PURE__*/ t("ZodNullable", (e, t) => {
	En.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => ai(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function Oa(e) {
	return new Da({
		type: "nullable",
		innerType: e
	});
}
var ka = /*@__PURE__*/ t("ZodDefault", (e, t) => {
	Dn.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => si(e, t, n, r), e.unwrap = () => e._zod.def.innerType, e.removeDefault = e.unwrap;
});
function Aa(e, t) {
	return new ka({
		type: "default",
		innerType: e,
		get defaultValue() {
			return typeof t == "function" ? t() : ie(t);
		}
	});
}
var ja = /*@__PURE__*/ t("ZodPrefault", (e, t) => {
	kn.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => ci(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function Ma(e, t) {
	return new ja({
		type: "prefault",
		innerType: e,
		get defaultValue() {
			return typeof t == "function" ? t() : ie(t);
		}
	});
}
var Na = /*@__PURE__*/ t("ZodNonOptional", (e, t) => {
	An.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => oi(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function Pa(e, t) {
	return new Na({
		type: "nonoptional",
		innerType: e,
		...b(t)
	});
}
var Fa = /*@__PURE__*/ t("ZodCatch", (e, t) => {
	Mn.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => li(e, t, n, r), e.unwrap = () => e._zod.def.innerType, e.removeCatch = e.unwrap;
});
function Ia(e, t) {
	return new Fa({
		type: "catch",
		innerType: e,
		catchValue: typeof t == "function" ? t : () => t
	});
}
var La = /*@__PURE__*/ t("ZodPipe", (e, t) => {
	Nn.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => ui(e, t, n, r), e.in = t.in, e.out = t.out;
});
function Ra(e, t) {
	return new La({
		type: "pipe",
		in: e,
		out: t
	});
}
var za = /*@__PURE__*/ t("ZodReadonly", (e, t) => {
	Pn.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => di(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function Ba(e) {
	return new za({
		type: "readonly",
		innerType: e
	});
}
var Va = /*@__PURE__*/ t("ZodCustom", (e, t) => {
	In.init(e, t), H.init(e, t), e._zod.processJSONSchema = (t, n, r) => Qr(e, t, n, r);
});
function Ha(e, t = {}) {
	return /* @__PURE__ */ Rr(Va, e, t);
}
function Ua(e, t) {
	return /* @__PURE__ */ zr(e, t);
}
var Z = U().min(1).refine((e) => e === e.trim(), { message: "Идентификатор не должен начинаться или заканчиваться пробелом" }), Wa = K().finite().nonnegative(), Ga = J({
	text: U().min(1),
	start: Wa,
	end: Wa,
	source: Y([
		"alignment",
		"tts",
		"manual"
	]),
	confidence: K().min(0).max(1).optional()
}).refine((e) => e.end >= e.start, { message: "Конец слова не может быть раньше начала" }), Ka = J({
	text: U().min(1),
	before: U(),
	after: U()
}), qa = ma("kind", [J({
	kind: X("seconds"),
	t: Wa
}), J({
	kind: X("word"),
	wordIndex: K().int().nonnegative(),
	offset: K().finite(),
	anchor: Ka
})]), Ja = J({
	id: Z,
	type: Y([
		"text",
		"image",
		"shape"
	]),
	content: U().default("")
}), Ya = J({
	x: K().finite(),
	y: K().finite(),
	width: K().finite().nonnegative(),
	height: K().finite().nonnegative(),
	rotation: K().finite().default(0),
	zIndex: K().int().default(0),
	opacity: K().min(0).max(1).default(1),
	visible: ia().default(!0),
	style: va(U(), fa([U(), K()])).default({})
}), Xa = J({
	id: Z,
	at: qa,
	transition: Y(["morph", "cut"]).default("morph"),
	states: va(Z, Ya)
}), Za = J({
	id: Z,
	at: qa,
	config: ma("kind", [
		J({
			kind: X("choice"),
			prompt: U(),
			options: q(J({
				id: Z,
				label: U()
			})).min(2),
			correctId: Z
		}),
		J({
			kind: X("input"),
			prompt: U(),
			accept: q(U().min(1)).min(1),
			caseSensitive: ia().default(!1)
		}),
		J({
			kind: X("continue"),
			label: U().default("Дальше")
		})
	]),
	onWrong: Y([
		"inline-hint",
		"inline-explain",
		"retry",
		"continue"
	]).default("retry"),
	maxAttempts: K().int().positive().nullable().default(null),
	recordAs: Z
}).refine((e) => {
	let t = e.config;
	return t.kind !== "choice" || t.options.some((e) => e.id === t.correctId);
}, { message: "correctId должен указывать на один из вариантов" }), Qa = J({
	rules: q(J({
		id: Z,
		when: ma("kind", [
			J({
				kind: X("equals"),
				variable: Z,
				value: U()
			}),
			J({
				kind: X("correct"),
				variable: Z
			}),
			J({
				kind: X("wrong"),
				variable: Z
			})
		]),
		goto: Z
	})).default([]),
	default: Z.nullable().default(null)
}), $a = J({
	id: Z,
	title: U().default(""),
	audio: J({
		src: U().min(1),
		duration: K().finite().positive(),
		words: q(Ga)
	}),
	elements: q(Ja),
	slides: q(Xa).min(1),
	gates: q(Za).default([]),
	exit: Qa
});
J({
	entry: Z,
	segments: q($a).min(1)
});
var eo = J({
	schemaVersion: X(3),
	meta: J({
		title: U(),
		stageWidth: K().int().positive().default(1920),
		stageHeight: K().int().positive().default(1080)
	}),
	entry: Z,
	segments: q($a).min(1)
}).superRefine((e, t) => {
	let { segments: n, entry: r } = e, i = new Set(n.map((e) => e.id));
	i.size !== n.length && t.addIssue({
		code: "custom",
		path: ["segments"],
		message: "Идентификатор сегмента повторяется"
	}), i.has(r) || t.addIssue({
		code: "custom",
		path: ["entry"],
		message: `Стартовый сегмент «${r}» не существует`
	});
	let a = /* @__PURE__ */ new Map();
	for (let e of n) for (let n of e.gates) {
		let r = a.get(n.recordAs);
		if (r) {
			t.addIssue({
				code: "custom",
				path: ["segments"],
				message: `Переменная «${n.recordAs}» записывается дважды: в сегменте «${r.segmentId}» и в «${e.id}». Второй ответ затёр бы первый, и правило выхода стало бы неоднозначным.`
			});
			continue;
		}
		let i = n.config;
		a.set(n.recordAs, {
			kind: i.kind,
			segmentId: e.id,
			optionIds: i.kind === "choice" ? i.options.map((e) => e.id) : []
		});
	}
	n.forEach((e, n) => {
		let r = (...e) => [
			"segments",
			n,
			...e
		], o = new Set(e.elements.map((e) => e.id)), s = e.audio.words.length;
		o.size !== e.elements.length && t.addIssue({
			code: "custom",
			path: r("elements"),
			message: `Сегмент «${e.id}»: идентификатор элемента повторяется`
		});
		let c = (n, r) => {
			if (n.kind === "seconds") return n.t > e.audio.duration && t.addIssue({
				code: "custom",
				path: r,
				message: `Время ${n.t} с выходит за длительность дорожки ${e.audio.duration} с`
			}), n.t;
			if (n.wordIndex >= s) {
				t.addIssue({
					code: "custom",
					path: r,
					message: s === 0 ? "Ссылка на слово при пустом транскрипте" : `Слово №${n.wordIndex} отсутствует, всего слов ${s}`
				});
				return;
			}
			return e.audio.words[n.wordIndex].start + n.offset;
		}, l = e.slides[0];
		if (!l) return;
		(l.at.kind !== "seconds" || l.at.t !== 0) && t.addIssue({
			code: "custom",
			path: r("slides", 0, "at"),
			message: `Сегмент «${e.id}»: первый слайд обязан стоять на нуле ({ kind: "seconds", t: 0 }). Привязка нулевого кадра к слову сделала бы начальный вид сегмента зависимым от транскрипта.`
		});
		let u = /* @__PURE__ */ new Set(), d = -Infinity;
		e.slides.forEach((n, i) => {
			u.has(n.id) && t.addIssue({
				code: "custom",
				path: r("slides", i, "id"),
				message: `Сегмент «${e.id}»: идентификатор слайда «${n.id}» повторяется`
			}), u.add(n.id);
			let a = c(n.at, r("slides", i, "at"));
			a !== void 0 && (a < d ? t.addIssue({
				code: "custom",
				path: r("slides", i, "at"),
				message: `Сегмент «${e.id}»: слайды идут не по порядку — ${a.toFixed(3)} с после ${d.toFixed(3)} с`
			}) : a === d && t.addIssue({
				code: "custom",
				path: r("slides", i, "at"),
				message: `Сегмент «${e.id}»: два слайда на одной секунде (${a.toFixed(3)}) — какой из них показывать, неизвестно`
			}), d = a);
			for (let e of Object.keys(n.states)) o.has(e) || t.addIssue({
				code: "custom",
				path: r("slides", i, "states", e),
				message: `Слайд «${n.id}» задаёт состояние элемента «${e}», которого нет в сегменте`
			});
		}), e.gates.forEach((e, t) => {
			c(e.at, r("gates", t, "at"));
		});
		let f = /* @__PURE__ */ new Set();
		if (e.exit.rules.forEach((n, o) => {
			let s = r("exit", "rules", o);
			f.has(n.id) && t.addIssue({
				code: "custom",
				path: [...s, "id"],
				message: `Сегмент «${e.id}»: идентификатор правила «${n.id}» повторяется`
			}), f.add(n.id), i.has(n.goto) || t.addIssue({
				code: "custom",
				path: [...s, "goto"],
				message: `Правило выхода ведёт в несуществующий сегмент «${n.goto}»`
			});
			let c = a.get(n.when.variable);
			if (!c) {
				t.addIssue({
					code: "custom",
					path: [
						...s,
						"when",
						"variable"
					],
					message: `Правило выхода смотрит на переменную «${n.when.variable}», которую не записывает ни один гейт объяснения`
				});
				return;
			}
			n.when.kind === "equals" && c.kind === "continue" && t.addIssue({
				code: "custom",
				path: [...s, "when"],
				message: `Переменная «${n.when.variable}» пишется гейтом вида continue: у него один исход, и сравнивать её значение не с чем`
			}), n.when.kind === "equals" && c.kind === "choice" && !c.optionIds.includes(n.when.value) && t.addIssue({
				code: "custom",
				path: [
					...s,
					"when",
					"value"
				],
				message: `Правило выхода сравнивает «${n.when.variable}» со значением «${n.when.value}», которого нет среди вариантов гейта. Эта ветка недостижима навсегда.`
			});
		}), e.exit.default !== null && !i.has(e.exit.default) && t.addIssue({
			code: "custom",
			path: r("exit", "default"),
			message: `Выход по умолчанию ведёт в несуществующий сегмент «${e.exit.default}»`
		}), e.exit.rules.length > 0 && e.exit.default === null) {
			let n = new Set(e.exit.rules.map((e) => e.when.variable)), i = new Set(e.exit.rules.map((e) => e.when.kind)), o = !1;
			if (n.size === 1) {
				let t = [...n][0], r = a.get(t);
				if (i.has("correct") && i.has("wrong")) o = !0;
				else if (r && i.size === 1 && i.has("equals")) {
					let t = new Set(e.exit.rules.map((e) => e.when.kind === "equals" ? e.when.value : ""));
					o = r.optionIds.length > 0 && r.optionIds.every((e) => t.has(e));
				}
			}
			o || t.addIssue({
				code: "custom",
				path: r("exit", "default"),
				message: `Сегмент «${e.id}»: правила выхода не покрывают все исходы, а запасного выхода нет. Ответ, не подошедший ни под одно правило, привёл бы зрителя в тупик. Задайте default, либо покройте правилами все варианты одного гейта, либо возьмите оба исхода «верно» и «неверно».`
			});
		}
	});
}), to = "node-1", no = (e) => {
	let t = e;
	return {
		schemaVersion: 2,
		meta: t.meta,
		entry: to,
		nodes: [{
			id: to,
			title: t.meta?.title,
			audio: t.audio,
			scene: t.scene,
			edges: []
		}]
	};
}, Q = (e, t) => typeof e == "number" && Number.isFinite(e) ? e : t;
function ro(e) {
	return !e || typeof e != "object" ? "broken" : e.kind === "seconds" ? `s:${String(e.t)}` : e.kind === "word" ? `w:${String(e.wordIndex)}:${String(e.offset)}` : "broken";
}
function io(e, t) {
	if (!e || typeof e != "object") return;
	if (e.kind === "seconds") return typeof e.t == "number" && Number.isFinite(e.t) ? e.t : void 0;
	if (e.kind !== "word") return;
	let n = e.wordIndex;
	if (typeof n != "number" || !Number.isInteger(n)) return;
	let r = t[n];
	if (!(!r || typeof r.start != "number")) return r.start + Q(e.offset, 0);
}
function ao(e, t, n, r) {
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
var oo = (e) => Object.fromEntries(Object.entries(e).map(([e, t]) => [e, {
	...t,
	style: { ...t.style }
}]));
function so(e, t) {
	let n = e.scene?.elements ?? [], r = e.scene?.cues ?? [], i = e.audio?.words ?? [], a = Q(e.audio?.duration, 0), o = {};
	for (let e of n) {
		let t = String(e.id), n = { ...e.style ?? {} }, r = 1, i = !0;
		if ("opacity" in n) {
			let e = Number(n.opacity);
			delete n.opacity, Number.isFinite(e) && (e === 0 ? i = !1 : r = Math.min(1, Math.max(0, e)));
		}
		o[t] = {
			x: Q(e.x, 0),
			y: Q(e.y, 0),
			width: Q(e.width, 0),
			height: Q(e.height, 0),
			rotation: Q(e.rotation, 0),
			zIndex: Q(e.zIndex, 0),
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
		let t = ro(e.at), n = io(e.at, i);
		if (c(t, n, e.at).starts.push(e), n === void 0) continue;
		let r = Q(e.animation?.duration, 0), o = Math.min(n + r / 1e3, a);
		o <= n || c(`s:${o}`, o, {
			kind: "seconds",
			t: o
		}).ends.push(e);
	}
	let l = [...s.values()].sort((e, t) => (e.seconds ?? Infinity) - (t.seconds ?? Infinity)), u = oo(o), d = /* @__PURE__ */ new Map();
	for (let e of r) {
		if (e.animation?.from === void 0) continue;
		let t = `${String(e.targetId)} ${String(e.animation.property)}`, n = io(e.at, i) ?? Infinity, r = d.get(t);
		(!r || n < r.seconds) && d.set(t, {
			seconds: n,
			cue: e
		});
	}
	for (let { cue: e } of d.values()) {
		let t = String(e.targetId), n = u[t], r = o[t];
		n && r && ao(n, r, e.animation?.property, e.animation?.from);
	}
	let f = [];
	return l.forEach((e, n) => {
		for (let t of e.ends) {
			let e = String(t.targetId), n = u[e], r = o[e];
			n && r && ao(n, r, t.animation?.property, t.animation?.to);
		}
		for (let t of e.starts) {
			let e = String(t.targetId), n = u[e], r = o[e];
			if (!n || !r) continue;
			let i = t.animation;
			i?.from !== void 0 && ao(n, r, i.property, i.from);
		}
		f.push({
			id: `${t}-slide-${n + 1}`,
			at: e.at,
			transition: "morph",
			states: oo(u)
		}), u = oo(u);
	}), f;
}
var co = Object.freeze({
	retry: "retry",
	reveal: "inline-explain",
	continue: "continue"
}), lo = Object.freeze({
	1: no,
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
				let o = co[String(e.onWrong)] ?? "retry";
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
				slides: so(e, t),
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
	}
}), uo = class extends Error {
	found;
	constructor(e, t) {
		super(e), this.found = t, this.name = "SchemaVersionError";
	}
};
function fo(e) {
	if (typeof e != "object" || !e) throw new uo("Проект должен быть объектом", e);
	let t = e.schemaVersion;
	if (typeof t != "number" || !Number.isInteger(t) || t < 1) throw new uo(`Некорректная schemaVersion: ${JSON.stringify(t)}`, t);
	return t;
}
function po(e) {
	let t = fo(e);
	if (t > 3) throw new uo(`Проект сохранён в версии схемы ${t}, а эта сборка понимает только 3. Обновите приложение.`, t);
	let n = e;
	for (; t < 3;) {
		let e = lo[t];
		if (!e) throw new uo(`Нет миграции с версии ${t} на ${t + 1}. Каждая версия схемы обязана иметь миграцию (инвариант №7).`, t);
		n = e(n), t = fo(n);
	}
	return n;
}
//#endregion
//#region packages/core/src/time.ts
function mo(e) {
	return e.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]/gu, "");
}
var ho = class extends Error {
	ref;
	constructor(e, t) {
		super(e), this.ref = t, this.name = "TimeRefError";
	}
};
function go(e, t) {
	if (e.kind === "seconds") return e.t;
	let n = t[e.wordIndex];
	if (!n) throw new ho(t.length === 0 ? "Ссылка на слово, но транскрипт пуст" : `Слово №${e.wordIndex} отсутствует, всего слов ${t.length}`, e);
	if (mo(n.text) !== e.anchor.text) throw new ho(`Слово №${e.wordIndex} теперь «${n.text}», а метка ставилась на «${e.anchor.text}». Требуется перепривязка.`, e);
	return Math.max(0, n.start + e.offset);
}
//#endregion
//#region packages/core/src/graph.ts
function _o(e, t) {
	let n = e.segments.find((e) => e.id === t);
	if (!n) throw Error(`Сегмента «${t}» нет в объяснении`);
	return n;
}
function vo(e, t) {
	let n = t[e.variable];
	if (!n) return !1;
	switch (e.kind) {
		case "equals": return n.value === e.value;
		case "correct": return n.correct;
		case "wrong": return !n.correct;
		default: return !1;
	}
}
function yo(e, t) {
	for (let n of e.exit.rules) if (vo(n.when, t)) return n.goto;
	return e.exit.default;
}
function bo(e) {
	let t = e.exit.rules.map((e) => e.goto);
	return e.exit.default !== null && t.push(e.exit.default), [...new Set(t)];
}
//#endregion
//#region packages/core/src/load.ts
var xo = class extends Error {
	issues;
	constructor(e, t) {
		super(e), this.issues = t, this.name = "ProjectLoadError";
	}
};
function So(e) {
	let t = po(e), n = eo.safeParse(t);
	if (!n.success) {
		let e = n.error.issues.map((e) => `${e.path.join(".") || "<корень>"}: ${e.message}`);
		throw new xo(`Проект не прошёл валидацию (${e.length} проблем):\n  ${e.join("\n  ")}`, e);
	}
	return n.data;
}
//#endregion
//#region packages/player/src/clock.ts
var Co = 1, wo = 8, To = .02;
async function Eo(e, t) {
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
var Do = class {
	#e;
	#t;
	#n;
	#r;
	#i = null;
	#a = null;
	#o = null;
	constructor(e, t) {
		this.#e = e, this.#t = t, this.#n = e.createGain(), this.#n.connect(e.destination), this.#r = Oo(e);
	}
	get context() {
		return this.#e;
	}
	get duration() {
		return this.#t.duration;
	}
	get endsAtContextTime() {
		let e = this.#a;
		return e ? e.ctxTime + (this.#t.duration - e.mediaTime) : null;
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
		let n = t.leadTime ?? To, r = t.rampMs ?? wo, i = this.#e.createBufferSource();
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
		let i = (t.rampMs ?? wo) / 1e3, a = this.#e.currentTime, o = r.ctxTime + (e - r.mediaTime), s = Math.max(a + .001, o);
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
};
function Oo(e) {
	let t = e.getOutputTimestamp?.();
	if (!t || typeof t.contextTime != "number") return console.warn("[clock] getOutputTimestamp недоступен, беру запасную формулу"), !1;
	let n = Math.abs(t.contextTime - e.currentTime);
	return n < Co ? !0 : (console.warn(`[clock] getOutputTimestamp невменяем: contextTime=${t.contextTime}, currentTime=${e.currentTime}, расхождение ${n.toFixed(3)} с. Беру запасную формулу.`), !1);
}
//#endregion
//#region packages/player/src/render.ts
var ko = 1920, Ao = 1080;
function jo(e, t, n) {
	if (!(e > 0) || !(t > 0)) throw RangeError(`Некорректный размер контейнера: ${e}x${t}`);
	let r = Math.min(e / n.width, t / n.height);
	return {
		scale: r,
		offsetX: (e - n.width * r) / 2,
		offsetY: (t - n.height * r) / 2
	};
}
function Mo(e, t, n) {
	e.className = `scene-el scene-${t.type}`, e.dataset.id = t.id;
	let r = e.style;
	r.position = "absolute", r.left = `${n.x}px`, r.top = `${n.y}px`, r.width = `${n.width}px`, r.height = `${n.height}px`, r.zIndex = String(n.zIndex), r.opacity = String(n.opacity), r.transform = n.rotation ? `rotate(${n.rotation}deg)` : "", r.margin = "0", r.boxSizing = "border-box", r.visibility = n.visible ? "" : "hidden";
	for (let [e, t] of Object.entries(n.style)) r.setProperty(e, String(t));
	switch (t.type) {
		case "text":
			e.textContent = t.content;
			break;
		case "image":
			e.textContent = "", r.backgroundImage = t.content ? `url(${t.content})` : "", r.backgroundSize = "cover";
			break;
		case "shape":
			e.textContent = "";
			break;
	}
}
function No(e, t, n, r = {
	width: ko,
	height: Ao
}) {
	e.textContent = "", e.style.position = "relative", e.style.width = `${r.width}px`, e.style.height = `${r.height}px`, e.style.transformOrigin = "0 0", e.style.overflow = "hidden";
	let i = /* @__PURE__ */ new Map();
	for (let r of t) {
		let t = n[r.id];
		if (!t) continue;
		let a = document.createElement("div");
		Mo(a, r, t), e.appendChild(a), i.set(r.id, a);
	}
	return i;
}
function Po(e, t, n, r = {
	width: ko,
	height: Ao
}) {
	let i = jo(t, n, r);
	return e.style.transform = `translate(${i.offsetX}px, ${i.offsetY}px) scale(${i.scale})`, i;
}
//#endregion
//#region packages/player/src/slides.ts
var Fo = class {
	#e;
	#t;
	#n;
	#r;
	#i;
	#a = -1;
	constructor(e) {
		this.#e = e.host, this.#t = e.elements, this.#n = e.stage, this.#r = e.slides.map((t) => ({
			seconds: go(t.at, e.words),
			slide: t
		})), this.#i = /* @__PURE__ */ new Map(), this.renderAt(0);
	}
	get nodes() {
		return this.#i;
	}
	indexAt(e) {
		let t = 0;
		for (let n = 0; n < this.#r.length && this.#r[n].seconds <= e; n++) t = n;
		return t;
	}
	slideAt(e) {
		return this.#r[this.indexAt(e)].slide;
	}
	seekSeconds(e) {
		let t = this.indexAt(e);
		t !== this.#a && this.#o(t);
	}
	renderAt(e) {
		this.#a = -1, this.#o(this.indexAt(e));
	}
	#o(e) {
		let t = this.#r[e].slide.states, n = new Set(Object.keys(t));
		if (this.#i.size === n.size && [...this.#i.keys()].every((e) => n.has(e))) for (let e of this.#t) {
			let n = this.#i.get(e.id), r = t[e.id];
			n && r && Mo(n, e, r);
		}
		else this.#i = No(this.#e, this.#t, t, this.#n);
		this.#a = e;
	}
	destroy() {
		this.#e.textContent = "", this.#i = /* @__PURE__ */ new Map(), this.#a = -1;
	}
};
//#endregion
//#region packages/player/src/preview.ts
function $(e, t) {
	let n = _o(e, t);
	return {
		src: n.audio.src,
		words: n.audio.words,
		duration: n.audio.duration,
		elements: n.elements,
		slides: n.slides,
		gates: n.gates,
		stage: {
			width: e.meta.stageWidth,
			height: e.meta.stageHeight
		}
	};
}
function Io(e) {
	return e.entry;
}
var Lo = class {
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
		Mo(n, e, t);
	}
	rebuild(e) {
		this.#o(), this.#t = e, this.#n.destroy(), this.#n = this.#a(e), this.#n.renderAt(this.#r);
	}
	fit(e, t) {
		return this.#o(), Po(this.#e, e, t, this.#t.stage);
	}
	destroy() {
		this.#i ||= (this.#n.destroy(), !0);
	}
	#a(e) {
		return new Fo({
			host: this.#e,
			elements: e.elements,
			slides: e.slides,
			words: e.words,
			stage: e.stage
		});
	}
	#o() {
		if (this.#i) throw Error("ScenePreview уже уничтожен");
	}
}, Ro = 2, zo = .4, Bo = class {
	#e;
	#t;
	#n;
	#r;
	#i;
	#a;
	#o = null;
	#s = /* @__PURE__ */ new Map();
	#c = null;
	#l = null;
	#u = {};
	#d = null;
	#f = null;
	#p = /* @__PURE__ */ new Map();
	#m = [];
	#h = 0;
	#g = /* @__PURE__ */ new Map();
	#_ = "idle";
	#v = null;
	#y = null;
	#b = [];
	constructor(e, t, n = {}) {
		this.#e = e, this.#n = t, this.#i = Io(t), this.#a = $(t, this.#i), this.#r = n, this.#t = document.createElement("div"), this.#t.className = "player-stage", this.#t.style.pointerEvents = "none", this.#t.addEventListener("click", this.#T), e.appendChild(this.#t);
	}
	get state() {
		return this.#_;
	}
	get stageElement() {
		return this.#t;
	}
	get positionSeconds() {
		return this.#d?.position ?? 0;
	}
	get currentGate() {
		return this.#_ === "at-gate" ? this.#m[this.#h]?.gate : void 0;
	}
	#x(e) {
		this.#_ !== e && (this.#_ = e, this.#r.onStateChange?.(e));
	}
	async load() {
		this.#x("loading"), this.#y = new ResizeObserver(() => this.#w()), this.#y.observe(this.#e);
		let e = new AudioContext();
		this.#o = e, this.#d = new Do(e, await this.#S(this.#a.src)), this.#C(), this.#x("ready");
	}
	async #S(e) {
		let t = this.#s.get(e);
		if (t) return t;
		let n = this.#o;
		if (!n) throw Error("Нет аудиоконтекста: сначала load()");
		let r = await Eo(n, e);
		return this.#s.set(e, r.buffer), r.buffer;
	}
	#C() {
		this.#U(), this.#f?.destroy(), this.#f = new Fo({
			host: this.#t,
			elements: this.#a.elements,
			slides: this.#a.slides,
			words: this.#a.words,
			stage: this.#a.stage
		}), this.#p = new Map(this.#f.nodes), this.#b = [], this.#w(), this.#R(), this.#m = this.#a.gates.map((e) => ({
			gate: e,
			at: go(e.at, this.#a.words)
		})).sort((e, t) => e.at - t.at), this.#h = 0, this.#g.clear(), this.#f.renderAt(0);
	}
	#w() {
		Po(this.#t, this.#e.clientWidth, this.#e.clientHeight, this.#a.stage);
	}
	#T = (e) => {
		if (this.#_ !== "at-gate") return;
		let t = this.currentGate;
		if (!t || t.config.kind !== "choice") return;
		let n = e.target, r = (n instanceof HTMLElement ? n.closest("[data-id]") : null)?.dataset.id;
		r !== void 0 && t.config.options.some((e) => e.id === r) && this.answer(r);
	};
	#E(e) {
		if (e.config.kind !== "choice") return [];
		let t = [];
		for (let n of e.config.options) {
			let e = this.#p.get(n.id);
			if (!e) {
				t.push(n);
				continue;
			}
			e.dataset.answerOption = "1", e.style.cursor = "pointer", this.#b.push(n.id);
		}
		return t;
	}
	#D() {
		for (let e of this.#b) {
			let t = this.#p.get(e);
			t && (delete t.dataset.answerOption, t.style.cursor = "");
		}
		this.#b = [];
	}
	async play() {
		let e = this.#U();
		if (this.#_ !== "playing") {
			if (this.#_ === "at-gate") throw Error("Нельзя продолжить, пока гейт не пройден");
			if (await e.context.resume(), this.#O(0)) {
				e.holdBeforeStart(0), this.#L();
				return;
			}
			e.start(this.#_ === "ended" ? 0 : e.position), this.#_ === "ended" && (this.#h = 0), this.#x("playing"), this.#k();
		}
	}
	#O(e) {
		let t = this.#m[this.#h];
		return t !== void 0 && e >= t.at;
	}
	#k() {
		let e = () => {
			if (this.#_ !== "playing") return;
			let t = this.#U(), n = this.#W(), r = t.position;
			if (n.seekSeconds(r), this.#r.onFrame?.(r), this.#O(r)) {
				this.#I();
				return;
			}
			if (this.#j()) {
				this.#v = requestAnimationFrame(e);
				return;
			}
			if (this.#A(r), r >= t.duration - .02) {
				this.#P();
				return;
			}
			this.#v = requestAnimationFrame(e);
		};
		this.#v = requestAnimationFrame(e);
	}
	#A(e) {
		if (this.#c || this.#l) return;
		let t = this.#o, n = this.#d;
		if (!t || !n) return;
		let r = yo(_o(this.#n, this.#i), this.#u);
		if (r === null) return;
		let i = n.duration - e;
		if (i > Ro) return;
		let a = $(this.#n, r).src;
		if (!this.#s.has(a)) {
			this.#N(a);
			return;
		}
		if (i > zo) return;
		let o = n.endsAtContextTime;
		if (o === null) return;
		let s = o - t.currentTime;
		if (s <= 0) return;
		let c = this.#s.get(a);
		if (!c) return;
		let l = new Do(t, c), u = l.start(0, { leadTime: s });
		this.#c = {
			clock: l,
			nodeId: r,
			startsAt: u
		};
	}
	#j() {
		let e = this.#c, t = this.#o;
		return !e || !t || t.currentTime < e.startsAt ? !1 : (this.#d?.stop(), this.#d = e.clock, this.#i = e.nodeId, this.#a = $(this.#n, e.nodeId), this.#c = null, this.#C(), !0);
	}
	#M() {
		let e = this.#c;
		e && (e.clock.stop(), this.#c = null);
	}
	#N(e) {
		this.#l = this.#S(e).catch(() => void 0).finally(() => {
			this.#l = null;
		});
	}
	async #P() {
		let e = yo(_o(this.#n, this.#i), this.#u);
		if (e === null) {
			this.#B();
			return;
		}
		await this.#F(e);
	}
	async #F(e) {
		let t = this.#H();
		this.#V(), this.#M(), t.state === "suspended" && await t.resume(), this.#d?.stop(), this.#i = e, this.#a = $(this.#n, e), this.#d = new Do(t, await this.#S(this.#a.src)), this.#C(), this.#d.start(0), this.#x("playing"), this.#k();
	}
	async #I() {
		let e = this.#U(), t = this.#W(), n = this.#m[this.#h];
		if (!n) throw Error("Гейт исчез между проверкой и остановкой");
		this.#M(), await e.freezeAt(n.at), t.seekSeconds(n.at), this.#L();
	}
	#L() {
		let e = this.#m[this.#h];
		if (!e) throw Error("Нет гейта для открытия");
		this.#V(), this.#t.style.pointerEvents = "auto", this.#x("at-gate"), this.#R();
		let t = this.#E(e.gate);
		this.#r.onGateOpen?.(e.gate, t);
	}
	#R() {
		let e = _o(this.#n, this.#i);
		for (let t of bo(e)) {
			let e = $(this.#n, t).src;
			this.#s.has(e) || this.#N(e);
		}
	}
	async answer(e) {
		if (this.#_ !== "at-gate") throw Error(`Ответ вне гейта: состояние ${this.#_}`);
		let t = this.#m[this.#h];
		if (!t) throw Error("Нет открытого гейта");
		let { gate: n } = t, r = (this.#g.get(n.id) ?? 0) + 1;
		this.#g.set(n.id, r);
		let i = Vo(n, e), a = n.maxAttempts !== null && r >= n.maxAttempts, o;
		o = i || n.onWrong === "continue" ? "continue" : n.onWrong === "inline-explain" || n.onWrong === "inline-hint" || a ? "reveal" : "retry";
		let s = {
			gate: n,
			correct: i,
			attemptsUsed: r,
			outcome: o
		};
		return this.#u = {
			...this.#u,
			[n.recordAs]: {
				value: e ?? "",
				correct: i
			}
		}, this.#r.onGateResolved?.(s), o === "continue" && await this.#z(), s;
	}
	async continueAfterReveal() {
		if (this.#_ !== "at-gate") throw Error("Нет открытого гейта");
		await this.#z();
	}
	async #z() {
		let e = this.#U();
		this.#D(), this.#t.style.pointerEvents = "none", this.#h += 1, await e.resumeFromFreeze(), this.#x("playing"), this.#k();
	}
	#B() {
		this.#V(), this.#M(), this.#d?.stop(), this.#x("ended");
	}
	#V() {
		this.#v !== null && (cancelAnimationFrame(this.#v), this.#v = null);
	}
	destroy() {
		this.#V(), this.#M(), this.#y?.disconnect(), this.#d?.stop(), this.#d?.context.close(), this.#t.remove(), this.#x("idle");
	}
	#H() {
		if (!this.#o) throw Error("Плеер не загружен: сначала load()");
		return this.#o;
	}
	#U() {
		if (!this.#d) throw Error("Плеер не загружен: сначала load()");
		return this.#d;
	}
	#W() {
		if (!this.#f) throw Error("Плеер не загружен: сначала load()");
		return this.#f;
	}
};
function Vo(e, t) {
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
export { Do as AudioClock, Ao as DEFAULT_STAGE_HEIGHT, ko as DEFAULT_STAGE_WIDTH, Bo as Player, xo as ProjectLoadError, Lo as ScenePreview, Fo as SlideEngine, Mo as applyElement, Po as applyFit, Io as entrySegmentOf, jo as fitStage, Vo as isCorrect, So as loadProject, Eo as loadTrack, No as renderScene, $ as segmentOf };
