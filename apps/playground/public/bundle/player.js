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
function w(e) {
	return e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function T(e, t, n) {
	let r = new e._zod.constr(t ?? e._zod.def);
	return (!t || n?.parent) && (r._zod.parent = e), r;
}
function E(e) {
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
function ee(e) {
	return Object.keys(e).filter((t) => e[t]._zod.optin === "optional" && e[t]._zod.optout === "optional");
}
var te = {
	safeint: [-(2 ** 53 - 1), 2 ** 53 - 1],
	int32: [-2147483648, 2147483647],
	uint32: [0, 4294967295],
	float32: [-34028234663852886e22, 34028234663852886e22],
	float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
};
function ne(e, t) {
	let n = e._zod.def, r = n.checks;
	if (r && r.length > 0) throw Error(".pick() cannot be used on object schemas containing refinements");
	return T(e, h(e._zod.def, {
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
function D(e, t) {
	let n = e._zod.def, r = n.checks;
	if (r && r.length > 0) throw Error(".omit() cannot be used on object schemas containing refinements");
	return T(e, h(e._zod.def, {
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
function O(e, t) {
	if (!x(t)) throw Error("Invalid input to extend: expected a plain object");
	let n = e._zod.def.checks;
	if (n && n.length > 0) {
		let n = e._zod.def.shape;
		for (let e in t) if (Object.getOwnPropertyDescriptor(n, e) !== void 0) throw Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
	}
	return T(e, h(e._zod.def, { get shape() {
		let n = {
			...e._zod.def.shape,
			...t
		};
		return m(this, "shape", n), n;
	} }));
}
function re(e, t) {
	if (!x(t)) throw Error("Invalid input to safeExtend: expected a plain object");
	return T(e, h(e._zod.def, { get shape() {
		let n = {
			...e._zod.def.shape,
			...t
		};
		return m(this, "shape", n), n;
	} }));
}
function ie(e, t) {
	if (e._zod.def.checks?.length) throw Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
	return T(e, h(e._zod.def, {
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
function ae(e, t, n) {
	let r = t._zod.def.checks;
	if (r && r.length > 0) throw Error(".partial() cannot be used on object schemas containing refinements");
	return T(t, h(t._zod.def, {
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
function oe(e, t, n) {
	return T(t, h(t._zod.def, { get shape() {
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
function se(e, t = 0) {
	if (e.aborted === !0) return !0;
	for (let n = t; n < e.issues.length; n++) if (e.issues[n]?.continue !== !0) return !0;
	return !1;
}
function ce(e, t = 0) {
	if (e.aborted === !0) return !0;
	for (let n = t; n < e.issues.length; n++) if (e.issues[n]?.continue === !1) return !0;
	return !1;
}
function le(e, t) {
	return t.map((t) => {
		var n;
		return (n = t).path ?? (n.path = []), t.path.unshift(e), t;
	});
}
function ue(e) {
	return typeof e == "string" ? e : e?.message;
}
function de(e, t, n) {
	let r = e.message ? e.message : ue(e.inst?._zod.def?.error?.(e)) ?? ue(t?.error?.(e)) ?? ue(n.customError?.(e)) ?? ue(n.localeError?.(e)) ?? "Invalid input", { inst: i, continue: a, input: o, ...s } = e;
	return s.path ??= [], s.message = r, t?.reportInput && (s.input = o), s;
}
function fe(e) {
	return Array.isArray(e) ? "array" : typeof e == "string" ? "string" : "unknown";
}
function pe(...e) {
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
var me = (e, t) => {
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
}, he = t("$ZodError", me), k = t("$ZodError", me, { Parent: Error });
function ge(e, t = (e) => e.message) {
	let n = {}, r = [];
	for (let i of e.issues) i.path.length > 0 ? (n[i.path[0]] = n[i.path[0]] || [], n[i.path[0]].push(t(i))) : r.push(t(i));
	return {
		formErrors: r,
		fieldErrors: n
	};
}
function _e(e, t = (e) => e.message) {
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
var ve = (e) => (t, r, i, o) => {
	let s = i ? {
		...i,
		async: !1
	} : { async: !1 }, c = t._zod.run({
		value: r,
		issues: []
	}, s);
	if (c instanceof Promise) throw new n();
	if (c.issues.length) {
		let t = new ((o?.Err) ?? e)(c.issues.map((e) => de(e, s, a())));
		throw v(t, o?.callee), t;
	}
	return c.value;
}, ye = (e) => async (t, n, r, i) => {
	let o = r ? {
		...r,
		async: !0
	} : { async: !0 }, s = t._zod.run({
		value: n,
		issues: []
	}, o);
	if (s instanceof Promise && (s = await s), s.issues.length) {
		let t = new ((i?.Err) ?? e)(s.issues.map((e) => de(e, o, a())));
		throw v(t, i?.callee), t;
	}
	return s.value;
}, be = (e) => (t, r, i) => {
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
		error: new (e ?? he)(s.issues.map((e) => de(e, o, a())))
	} : {
		success: !0,
		data: s.value
	};
}, xe = /* @__PURE__*/ be(k), A = (e) => async (t, n, r) => {
	let i = r ? {
		...r,
		async: !0
	} : { async: !0 }, o = t._zod.run({
		value: n,
		issues: []
	}, i);
	return o instanceof Promise && (o = await o), o.issues.length ? {
		success: !1,
		error: new e(o.issues.map((e) => de(e, i, a())))
	} : {
		success: !0,
		data: o.value
	};
}, Se = /* @__PURE__*/ A(k), Ce = (e) => (t, n, r) => {
	let i = r ? {
		...r,
		direction: "backward"
	} : { direction: "backward" };
	return ve(e)(t, n, i);
}, we = (e) => (t, n, r) => ve(e)(t, n, r), Te = (e) => async (t, n, r) => {
	let i = r ? {
		...r,
		direction: "backward"
	} : { direction: "backward" };
	return ye(e)(t, n, i);
}, Ee = (e) => async (t, n, r) => ye(e)(t, n, r), De = (e) => (t, n, r) => {
	let i = r ? {
		...r,
		direction: "backward"
	} : { direction: "backward" };
	return be(e)(t, n, i);
}, Oe = (e) => (t, n, r) => be(e)(t, n, r), ke = (e) => async (t, n, r) => {
	let i = r ? {
		...r,
		direction: "backward"
	} : { direction: "backward" };
	return A(e)(t, n, i);
}, Ae = (e) => async (t, n, r) => A(e)(t, n, r), je = /^[cC][0-9a-z]{6,}$/, Me = /^[0-9a-z]+$/, Ne = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/, Pe = /^[0-9a-vA-V]{20}$/, Fe = /^[A-Za-z0-9]{27}$/, Ie = /^[a-zA-Z0-9_-]{21}$/, Le = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/, Re = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/, ze = (e) => e ? RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${e}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`) : /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/, Be = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/, Ve = "^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$";
function He() {
	return new RegExp(Ve, "u");
}
var Ue = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/, We = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/, Ge = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/, Ke = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/, qe = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/, Je = /^[A-Za-z0-9_-]*$/, Ye = /^https?$/, Xe = /^\+[1-9]\d{6,14}$/, Ze = "(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))", Qe = /*@__PURE__*/ RegExp(`^${Ze}$`);
function $e(e) {
	let t = "(?:[01]\\d|2[0-3]):[0-5]\\d";
	return typeof e.precision == "number" ? e.precision === -1 ? `${t}` : e.precision === 0 ? `${t}:[0-5]\\d` : `${t}:[0-5]\\d\\.\\d{${e.precision}}` : `${t}(?::[0-5]\\d(?:\\.\\d+)?)?`;
}
function et(e) {
	return RegExp(`^${$e(e)}$`);
}
function tt(e) {
	let t = $e({ precision: e.precision }), n = ["Z"];
	e.local && n.push(""), e.offset && n.push("([+-](?:[01]\\d|2[0-3]):[0-5]\\d)");
	let r = `${t}(?:${n.join("|")})`;
	return RegExp(`^${Ze}T(?:${r})$`);
}
var nt = (e) => {
	let t = e ? `[\\s\\S]{${e?.minimum ?? 0},${e?.maximum ?? ""}}` : "[\\s\\S]*";
	return RegExp(`^${t}$`);
}, rt = /^-?\d+$/, it = /^-?\d+(?:\.\d+)?$/, at = /^(?:true|false)$/i, ot = /^[^A-Z]*$/, st = /^[^a-z]*$/, j = /*@__PURE__*/ t("$ZodCheck", (e, t) => {
	var n;
	e._zod ??= {}, e._zod.def = t, (n = e._zod).onattach ?? (n.onattach = []);
}), ct = {
	number: "number",
	bigint: "bigint",
	object: "date"
}, lt = /*@__PURE__*/ t("$ZodCheckLessThan", (e, t) => {
	j.init(e, t);
	let n = ct[typeof t.value];
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
}), ut = /*@__PURE__*/ t("$ZodCheckGreaterThan", (e, t) => {
	j.init(e, t);
	let n = ct[typeof t.value];
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
}), dt = /*@__PURE__*/ t("$ZodCheckMultipleOf", (e, t) => {
	j.init(e, t), e._zod.onattach.push((e) => {
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
}), ft = /*@__PURE__*/ t("$ZodCheckNumberFormat", (e, t) => {
	j.init(e, t), t.format = t.format || "float64";
	let n = t.format?.includes("int"), r = n ? "int" : "number", [i, a] = te[t.format];
	e._zod.onattach.push((e) => {
		let r = e._zod.bag;
		r.format = t.format, r.minimum = i, r.maximum = a, n && (r.pattern = rt);
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
}), pt = /*@__PURE__*/ t("$ZodCheckMaxLength", (e, t) => {
	var n;
	j.init(e, t), (n = e._zod.def).when ?? (n.when = (e) => {
		let t = e.value;
		return !l(t) && t.length !== void 0;
	}), e._zod.onattach.push((e) => {
		let n = e._zod.bag.maximum ?? Infinity;
		t.maximum < n && (e._zod.bag.maximum = t.maximum);
	}), e._zod.check = (n) => {
		let r = n.value;
		if (r.length <= t.maximum) return;
		let i = fe(r);
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
}), mt = /*@__PURE__*/ t("$ZodCheckMinLength", (e, t) => {
	var n;
	j.init(e, t), (n = e._zod.def).when ?? (n.when = (e) => {
		let t = e.value;
		return !l(t) && t.length !== void 0;
	}), e._zod.onattach.push((e) => {
		let n = e._zod.bag.minimum ?? -Infinity;
		t.minimum > n && (e._zod.bag.minimum = t.minimum);
	}), e._zod.check = (n) => {
		let r = n.value;
		if (r.length >= t.minimum) return;
		let i = fe(r);
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
}), ht = /*@__PURE__*/ t("$ZodCheckLengthEquals", (e, t) => {
	var n;
	j.init(e, t), (n = e._zod.def).when ?? (n.when = (e) => {
		let t = e.value;
		return !l(t) && t.length !== void 0;
	}), e._zod.onattach.push((e) => {
		let n = e._zod.bag;
		n.minimum = t.length, n.maximum = t.length, n.length = t.length;
	}), e._zod.check = (n) => {
		let r = n.value, i = r.length;
		if (i === t.length) return;
		let a = fe(r), o = i > t.length;
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
}), gt = /*@__PURE__*/ t("$ZodCheckStringFormat", (e, t) => {
	var n, r;
	j.init(e, t), e._zod.onattach.push((e) => {
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
}), _t = /*@__PURE__*/ t("$ZodCheckRegex", (e, t) => {
	gt.init(e, t), e._zod.check = (n) => {
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
}), vt = /*@__PURE__*/ t("$ZodCheckLowerCase", (e, t) => {
	t.pattern ??= ot, gt.init(e, t);
}), yt = /*@__PURE__*/ t("$ZodCheckUpperCase", (e, t) => {
	t.pattern ??= st, gt.init(e, t);
}), bt = /*@__PURE__*/ t("$ZodCheckIncludes", (e, t) => {
	j.init(e, t);
	let n = w(t.includes), r = new RegExp(typeof t.position == "number" ? `^.{${t.position}}${n}` : n);
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
}), xt = /*@__PURE__*/ t("$ZodCheckStartsWith", (e, t) => {
	j.init(e, t);
	let n = RegExp(`^${w(t.prefix)}.*`);
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
}), St = /*@__PURE__*/ t("$ZodCheckEndsWith", (e, t) => {
	j.init(e, t);
	let n = RegExp(`.*${w(t.suffix)}$`);
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
}), Ct = /*@__PURE__*/ t("$ZodCheckOverwrite", (e, t) => {
	j.init(e, t), e._zod.check = (e) => {
		e.value = t.tx(e.value);
	};
}), wt = class {
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
}, Tt = {
	major: 4,
	minor: 4,
	patch: 3
}, M = /*@__PURE__*/ t("$ZodType", (e, t) => {
	var r;
	e ??= {}, e._zod.def = t, e._zod.bag = e._zod.bag || {}, e._zod.version = Tt;
	let i = [...e._zod.def.checks ?? []];
	e._zod.traits.has("$ZodCheck") && i.unshift(e);
	for (let t of i) for (let n of t._zod.onattach) n(e);
	if (i.length === 0) (r = e._zod).deferred ?? (r.deferred = []), e._zod.deferred?.push(() => {
		e._zod.run = e._zod.parse;
	});
	else {
		let t = (e, t, r) => {
			let i = se(e), a;
			for (let o of t) {
				if (o._zod.def.when) {
					if (ce(e) || !o._zod.def.when(e)) continue;
				} else if (i) continue;
				let t = e.issues.length, s = o._zod.check(e);
				if (s instanceof Promise && r?.async === !1) throw new n();
				if (a || s instanceof Promise) a = (a ?? Promise.resolve()).then(async () => {
					await s, e.issues.length !== t && (i ||= se(e, t));
				});
				else {
					if (e.issues.length === t) continue;
					i ||= se(e, t);
				}
			}
			return a ? a.then(() => e) : e;
		}, r = (r, a, o) => {
			if (se(r)) return r.aborted = !0, r;
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
				let n = xe(e, t);
				return n.success ? { value: n.data } : { issues: n.error?.issues };
			} catch {
				return Se(e, t).then((e) => e.success ? { value: e.data } : { issues: e.error?.issues });
			}
		},
		vendor: "zod",
		version: 1
	}));
}), Et = /*@__PURE__*/ t("$ZodString", (e, t) => {
	M.init(e, t), e._zod.pattern = [...e?._zod.bag?.patterns ?? []].pop() ?? nt(e._zod.bag), e._zod.parse = (n, r) => {
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
}), N = /*@__PURE__*/ t("$ZodStringFormat", (e, t) => {
	gt.init(e, t), Et.init(e, t);
}), Dt = /*@__PURE__*/ t("$ZodGUID", (e, t) => {
	t.pattern ??= Re, N.init(e, t);
}), Ot = /*@__PURE__*/ t("$ZodUUID", (e, t) => {
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
		t.pattern ??= ze(e);
	} else t.pattern ??= ze();
	N.init(e, t);
}), kt = /*@__PURE__*/ t("$ZodEmail", (e, t) => {
	t.pattern ??= Be, N.init(e, t);
}), At = /*@__PURE__*/ t("$ZodURL", (e, t) => {
	N.init(e, t), e._zod.check = (n) => {
		try {
			let r = n.value.trim();
			if (!t.normalize && t.protocol?.source === Ye.source && !/^https?:\/\//i.test(r)) {
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
}), jt = /*@__PURE__*/ t("$ZodEmoji", (e, t) => {
	t.pattern ??= He(), N.init(e, t);
}), Mt = /*@__PURE__*/ t("$ZodNanoID", (e, t) => {
	t.pattern ??= Ie, N.init(e, t);
}), Nt = /*@__PURE__*/ t("$ZodCUID", (e, t) => {
	t.pattern ??= je, N.init(e, t);
}), Pt = /*@__PURE__*/ t("$ZodCUID2", (e, t) => {
	t.pattern ??= Me, N.init(e, t);
}), Ft = /*@__PURE__*/ t("$ZodULID", (e, t) => {
	t.pattern ??= Ne, N.init(e, t);
}), It = /*@__PURE__*/ t("$ZodXID", (e, t) => {
	t.pattern ??= Pe, N.init(e, t);
}), Lt = /*@__PURE__*/ t("$ZodKSUID", (e, t) => {
	t.pattern ??= Fe, N.init(e, t);
}), Rt = /*@__PURE__*/ t("$ZodISODateTime", (e, t) => {
	t.pattern ??= tt(t), N.init(e, t);
}), zt = /*@__PURE__*/ t("$ZodISODate", (e, t) => {
	t.pattern ??= Qe, N.init(e, t);
}), Bt = /*@__PURE__*/ t("$ZodISOTime", (e, t) => {
	t.pattern ??= et(t), N.init(e, t);
}), Vt = /*@__PURE__*/ t("$ZodISODuration", (e, t) => {
	t.pattern ??= Le, N.init(e, t);
}), Ht = /*@__PURE__*/ t("$ZodIPv4", (e, t) => {
	t.pattern ??= Ue, N.init(e, t), e._zod.bag.format = "ipv4";
}), Ut = /*@__PURE__*/ t("$ZodIPv6", (e, t) => {
	t.pattern ??= We, N.init(e, t), e._zod.bag.format = "ipv6", e._zod.check = (n) => {
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
}), Wt = /*@__PURE__*/ t("$ZodCIDRv4", (e, t) => {
	t.pattern ??= Ge, N.init(e, t);
}), Gt = /*@__PURE__*/ t("$ZodCIDRv6", (e, t) => {
	t.pattern ??= Ke, N.init(e, t), e._zod.check = (n) => {
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
function Kt(e) {
	if (e === "") return !0;
	if (/\s/.test(e) || e.length % 4 != 0) return !1;
	try {
		return atob(e), !0;
	} catch {
		return !1;
	}
}
var qt = /*@__PURE__*/ t("$ZodBase64", (e, t) => {
	t.pattern ??= qe, N.init(e, t), e._zod.bag.contentEncoding = "base64", e._zod.check = (n) => {
		Kt(n.value) || n.issues.push({
			code: "invalid_format",
			format: "base64",
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
});
function Jt(e) {
	if (!Je.test(e)) return !1;
	let t = e.replace(/[-_]/g, (e) => e === "-" ? "+" : "/");
	return Kt(t.padEnd(Math.ceil(t.length / 4) * 4, "="));
}
var Yt = /*@__PURE__*/ t("$ZodBase64URL", (e, t) => {
	t.pattern ??= Je, N.init(e, t), e._zod.bag.contentEncoding = "base64url", e._zod.check = (n) => {
		Jt(n.value) || n.issues.push({
			code: "invalid_format",
			format: "base64url",
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), Xt = /*@__PURE__*/ t("$ZodE164", (e, t) => {
	t.pattern ??= Xe, N.init(e, t);
});
function Zt(e, t = null) {
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
var Qt = /*@__PURE__*/ t("$ZodJWT", (e, t) => {
	N.init(e, t), e._zod.check = (n) => {
		Zt(n.value, t.alg) || n.issues.push({
			code: "invalid_format",
			format: "jwt",
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), $t = /*@__PURE__*/ t("$ZodNumber", (e, t) => {
	M.init(e, t), e._zod.pattern = e._zod.bag.pattern ?? it, e._zod.parse = (n, r) => {
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
}), en = /*@__PURE__*/ t("$ZodNumberFormat", (e, t) => {
	ft.init(e, t), $t.init(e, t);
}), tn = /*@__PURE__*/ t("$ZodBoolean", (e, t) => {
	M.init(e, t), e._zod.pattern = at, e._zod.parse = (n, r) => {
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
}), nn = /*@__PURE__*/ t("$ZodUnknown", (e, t) => {
	M.init(e, t), e._zod.parse = (e) => e;
}), rn = /*@__PURE__*/ t("$ZodNever", (e, t) => {
	M.init(e, t), e._zod.parse = (t, n) => (t.issues.push({
		expected: "never",
		code: "invalid_type",
		input: t.value,
		inst: e
	}), t);
});
function an(e, t, n) {
	e.issues.length && t.issues.push(...le(n, e.issues)), t.value[n] = e.value;
}
var on = /*@__PURE__*/ t("$ZodArray", (e, t) => {
	M.init(e, t), e._zod.parse = (n, r) => {
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
			s instanceof Promise ? a.push(s.then((t) => an(t, n, e))) : an(s, n, e);
		}
		return a.length ? Promise.all(a).then(() => n) : n;
	};
});
function sn(e, t, n, r, i, a) {
	let o = n in r;
	if (e.issues.length) {
		if (i && a && !o) return;
		t.issues.push(...le(n, e.issues));
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
function cn(e) {
	let t = Object.keys(e.shape);
	for (let n of t) if (!e.shape?.[n]?._zod?.traits?.has("$ZodType")) throw Error(`Invalid element at key "${n}": expected a Zod schema`);
	let n = ee(e.shape);
	return {
		...e,
		keys: t,
		keySet: new Set(t),
		numKeys: t.length,
		optionalKeys: new Set(n)
	};
}
function ln(e, t, n, r, i, a) {
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
		a instanceof Promise ? e.push(a.then((e) => sn(e, n, i, t, u, d))) : sn(a, n, i, t, u, d);
	}
	return o.length && n.issues.push({
		code: "unrecognized_keys",
		keys: o,
		input: t,
		inst: a
	}), e.length ? Promise.all(e).then(() => n) : n;
}
var un = /*@__PURE__*/ t("$ZodObject", (e, t) => {
	if (M.init(e, t), !Object.getOwnPropertyDescriptor(t, "shape")?.get) {
		let e = t.shape;
		Object.defineProperty(t, "shape", { get: () => {
			let n = { ...e };
			return Object.defineProperty(t, "shape", { value: n }), n;
		} });
	}
	let n = c(() => cn(t));
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
			a instanceof Promise ? c.push(a.then((n) => sn(n, t, e, s, r, i))) : sn(a, t, e, s, r, i);
		}
		return i ? ln(c, s, t, o, n.value, e) : c.length ? Promise.all(c).then(() => t) : t;
	};
}), dn = /*@__PURE__*/ t("$ZodObjectJIT", (e, t) => {
	un.init(e, t);
	let n = e._zod.parse, r = c(() => cn(t)), a = (e) => {
		let t = new wt([
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
		return s(p) ? l && u && c?.async === !1 && c.jitless !== !0 ? (o ||= a(t.shape), i = o(i, c), d ? ln([], p, i, c, f, e) : i) : n(i, c) : (i.issues.push({
			expected: "object",
			code: "invalid_type",
			input: p,
			inst: e
		}), i);
	};
});
function fn(e, t, n, r) {
	for (let n of e) if (n.issues.length === 0) return t.value = n.value, t;
	let i = e.filter((e) => !se(e));
	return i.length === 1 ? (t.value = i[0].value, i[0]) : (t.issues.push({
		code: "invalid_union",
		input: t.value,
		inst: n,
		errors: e.map((e) => e.issues.map((e) => de(e, r, a())))
	}), t);
}
var pn = /*@__PURE__*/ t("$ZodUnion", (e, t) => {
	M.init(e, t), p(e._zod, "optin", () => t.options.some((e) => e._zod.optin === "optional") ? "optional" : void 0), p(e._zod, "optout", () => t.options.some((e) => e._zod.optout === "optional") ? "optional" : void 0), p(e._zod, "values", () => {
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
		return a ? Promise.all(o).then((t) => fn(t, r, e, i)) : fn(o, r, e, i);
	};
}), mn = /*@__PURE__*/ t("$ZodDiscriminatedUnion", (e, t) => {
	t.inclusive = !1, pn.init(e, t);
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
}), hn = /*@__PURE__*/ t("$ZodIntersection", (e, t) => {
	M.init(e, t), e._zod.parse = (e, n) => {
		let r = e.value, i = t.left._zod.run({
			value: r,
			issues: []
		}, n), a = t.right._zod.run({
			value: r,
			issues: []
		}, n);
		return i instanceof Promise || a instanceof Promise ? Promise.all([i, a]).then(([t, n]) => _n(e, t, n)) : _n(e, i, a);
	};
});
function gn(e, t) {
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
			let r = gn(e[n], t[n]);
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
			let i = e[r], a = t[r], o = gn(i, a);
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
function _n(e, t, n) {
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
	}), se(e)) return e;
	let o = gn(t.value, n.value);
	if (!o.valid) throw Error(`Unmergable intersection. Error path: ${JSON.stringify(o.mergeErrorPath)}`);
	return e.value = o.data, e;
}
var vn = /*@__PURE__*/ t("$ZodRecord", (e, t) => {
	M.init(e, t), e._zod.parse = (n, r) => {
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
						issues: s.issues.map((e) => de(e, r, a())),
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
					e.issues.length && n.issues.push(...le(l, e.issues)), n.value[u] = e.value;
				})) : (d.issues.length && n.issues.push(...le(l, d.issues)), n.value[u] = d.value);
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
				if (typeof s == "string" && it.test(s) && c.issues.length) {
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
						issues: c.issues.map((e) => de(e, r, a())),
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
					e.issues.length && n.issues.push(...le(s, e.issues)), n.value[c.value] = e.value;
				})) : (l.issues.length && n.issues.push(...le(s, l.issues)), n.value[c.value] = l.value);
			}
		}
		return o.length ? Promise.all(o).then(() => n) : n;
	};
}), yn = /*@__PURE__*/ t("$ZodEnum", (e, t) => {
	M.init(e, t);
	let n = o(t.entries), r = new Set(n);
	e._zod.values = r, e._zod.pattern = RegExp(`^(${n.filter((e) => C.has(typeof e)).map((e) => typeof e == "string" ? w(e) : e.toString()).join("|")})$`), e._zod.parse = (t, i) => {
		let a = t.value;
		return r.has(a) || t.issues.push({
			code: "invalid_value",
			values: n,
			input: a,
			inst: e
		}), t;
	};
}), bn = /*@__PURE__*/ t("$ZodLiteral", (e, t) => {
	if (M.init(e, t), t.values.length === 0) throw Error("Cannot create literal schema with no valid values");
	let n = new Set(t.values);
	e._zod.values = n, e._zod.pattern = RegExp(`^(${t.values.map((e) => typeof e == "string" ? w(e) : e ? w(e.toString()) : String(e)).join("|")})$`), e._zod.parse = (r, i) => {
		let a = r.value;
		return n.has(a) || r.issues.push({
			code: "invalid_value",
			values: t.values,
			input: a,
			inst: e
		}), r;
	};
}), xn = /*@__PURE__*/ t("$ZodTransform", (e, t) => {
	M.init(e, t), e._zod.optin = "optional", e._zod.parse = (i, a) => {
		if (a.direction === "backward") throw new r(e.constructor.name);
		let o = t.transform(i.value, i);
		if (a.async) return (o instanceof Promise ? o : Promise.resolve(o)).then((e) => (i.value = e, i.fallback = !0, i));
		if (o instanceof Promise) throw new n();
		return i.value = o, i.fallback = !0, i;
	};
});
function Sn(e, t) {
	return t === void 0 && (e.issues.length || e.fallback) ? {
		issues: [],
		value: void 0
	} : e;
}
var Cn = /*@__PURE__*/ t("$ZodOptional", (e, t) => {
	M.init(e, t), e._zod.optin = "optional", e._zod.optout = "optional", p(e._zod, "values", () => t.innerType._zod.values ? /* @__PURE__ */ new Set([...t.innerType._zod.values, void 0]) : void 0), p(e._zod, "pattern", () => {
		let e = t.innerType._zod.pattern;
		return e ? RegExp(`^(${u(e.source)})?$`) : void 0;
	}), e._zod.parse = (e, n) => {
		if (t.innerType._zod.optin === "optional") {
			let r = e.value, i = t.innerType._zod.run(e, n);
			return i instanceof Promise ? i.then((e) => Sn(e, r)) : Sn(i, r);
		}
		return e.value === void 0 ? e : t.innerType._zod.run(e, n);
	};
}), wn = /*@__PURE__*/ t("$ZodExactOptional", (e, t) => {
	Cn.init(e, t), p(e._zod, "values", () => t.innerType._zod.values), p(e._zod, "pattern", () => t.innerType._zod.pattern), e._zod.parse = (e, n) => t.innerType._zod.run(e, n);
}), Tn = /*@__PURE__*/ t("$ZodNullable", (e, t) => {
	M.init(e, t), p(e._zod, "optin", () => t.innerType._zod.optin), p(e._zod, "optout", () => t.innerType._zod.optout), p(e._zod, "pattern", () => {
		let e = t.innerType._zod.pattern;
		return e ? RegExp(`^(${u(e.source)}|null)$`) : void 0;
	}), p(e._zod, "values", () => t.innerType._zod.values ? /* @__PURE__ */ new Set([...t.innerType._zod.values, null]) : void 0), e._zod.parse = (e, n) => e.value === null ? e : t.innerType._zod.run(e, n);
}), En = /*@__PURE__*/ t("$ZodDefault", (e, t) => {
	M.init(e, t), e._zod.optin = "optional", p(e._zod, "values", () => t.innerType._zod.values), e._zod.parse = (e, n) => {
		if (n.direction === "backward") return t.innerType._zod.run(e, n);
		if (e.value === void 0) return e.value = t.defaultValue, e;
		let r = t.innerType._zod.run(e, n);
		return r instanceof Promise ? r.then((e) => Dn(e, t)) : Dn(r, t);
	};
});
function Dn(e, t) {
	return e.value === void 0 && (e.value = t.defaultValue), e;
}
var On = /*@__PURE__*/ t("$ZodPrefault", (e, t) => {
	M.init(e, t), e._zod.optin = "optional", p(e._zod, "values", () => t.innerType._zod.values), e._zod.parse = (e, n) => (n.direction === "backward" || e.value === void 0 && (e.value = t.defaultValue), t.innerType._zod.run(e, n));
}), kn = /*@__PURE__*/ t("$ZodNonOptional", (e, t) => {
	M.init(e, t), p(e._zod, "values", () => {
		let e = t.innerType._zod.values;
		return e ? new Set([...e].filter((e) => e !== void 0)) : void 0;
	}), e._zod.parse = (n, r) => {
		let i = t.innerType._zod.run(n, r);
		return i instanceof Promise ? i.then((t) => An(t, e)) : An(i, e);
	};
});
function An(e, t) {
	return !e.issues.length && e.value === void 0 && e.issues.push({
		code: "invalid_type",
		expected: "nonoptional",
		input: e.value,
		inst: t
	}), e;
}
var jn = /*@__PURE__*/ t("$ZodCatch", (e, t) => {
	M.init(e, t), e._zod.optin = "optional", p(e._zod, "optout", () => t.innerType._zod.optout), p(e._zod, "values", () => t.innerType._zod.values), e._zod.parse = (e, n) => {
		if (n.direction === "backward") return t.innerType._zod.run(e, n);
		let r = t.innerType._zod.run(e, n);
		return r instanceof Promise ? r.then((r) => (e.value = r.value, r.issues.length && (e.value = t.catchValue({
			...e,
			error: { issues: r.issues.map((e) => de(e, n, a())) },
			input: e.value
		}), e.issues = [], e.fallback = !0), e)) : (e.value = r.value, r.issues.length && (e.value = t.catchValue({
			...e,
			error: { issues: r.issues.map((e) => de(e, n, a())) },
			input: e.value
		}), e.issues = [], e.fallback = !0), e);
	};
}), Mn = /*@__PURE__*/ t("$ZodPipe", (e, t) => {
	M.init(e, t), p(e._zod, "values", () => t.in._zod.values), p(e._zod, "optin", () => t.in._zod.optin), p(e._zod, "optout", () => t.out._zod.optout), p(e._zod, "propValues", () => t.in._zod.propValues), e._zod.parse = (e, n) => {
		if (n.direction === "backward") {
			let r = t.out._zod.run(e, n);
			return r instanceof Promise ? r.then((e) => Nn(e, t.in, n)) : Nn(r, t.in, n);
		}
		let r = t.in._zod.run(e, n);
		return r instanceof Promise ? r.then((e) => Nn(e, t.out, n)) : Nn(r, t.out, n);
	};
});
function Nn(e, t, n) {
	return e.issues.length ? (e.aborted = !0, e) : t._zod.run({
		value: e.value,
		issues: e.issues,
		fallback: e.fallback
	}, n);
}
var Pn = /*@__PURE__*/ t("$ZodReadonly", (e, t) => {
	M.init(e, t), p(e._zod, "propValues", () => t.innerType._zod.propValues), p(e._zod, "values", () => t.innerType._zod.values), p(e._zod, "optin", () => t.innerType?._zod?.optin), p(e._zod, "optout", () => t.innerType?._zod?.optout), e._zod.parse = (e, n) => {
		if (n.direction === "backward") return t.innerType._zod.run(e, n);
		let r = t.innerType._zod.run(e, n);
		return r instanceof Promise ? r.then(Fn) : Fn(r);
	};
});
function Fn(e) {
	return e.value = Object.freeze(e.value), e;
}
var In = /*@__PURE__*/ t("$ZodCustom", (e, t) => {
	j.init(e, t), M.init(e, t), e._zod.parse = (e, t) => e, e._zod.check = (n) => {
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
		r._zod.def.params && (e.params = r._zod.def.params), t.issues.push(pe(e));
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
var Vn = globalThis.__zod_globalRegistry;
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/api.js
// @__NO_SIDE_EFFECTS__
function Hn(e, t) {
	return new e({
		type: "string",
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Un(e, t) {
	return new e({
		type: "string",
		format: "email",
		check: "string_format",
		abort: !1,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Wn(e, t) {
	return new e({
		type: "string",
		format: "guid",
		check: "string_format",
		abort: !1,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Gn(e, t) {
	return new e({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: !1,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Kn(e, t) {
	return new e({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: !1,
		version: "v4",
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function qn(e, t) {
	return new e({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: !1,
		version: "v6",
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Jn(e, t) {
	return new e({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: !1,
		version: "v7",
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Yn(e, t) {
	return new e({
		type: "string",
		format: "url",
		check: "string_format",
		abort: !1,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Xn(e, t) {
	return new e({
		type: "string",
		format: "emoji",
		check: "string_format",
		abort: !1,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Zn(e, t) {
	return new e({
		type: "string",
		format: "nanoid",
		check: "string_format",
		abort: !1,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Qn(e, t) {
	return new e({
		type: "string",
		format: "cuid",
		check: "string_format",
		abort: !1,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function $n(e, t) {
	return new e({
		type: "string",
		format: "cuid2",
		check: "string_format",
		abort: !1,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function er(e, t) {
	return new e({
		type: "string",
		format: "ulid",
		check: "string_format",
		abort: !1,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function tr(e, t) {
	return new e({
		type: "string",
		format: "xid",
		check: "string_format",
		abort: !1,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function nr(e, t) {
	return new e({
		type: "string",
		format: "ksuid",
		check: "string_format",
		abort: !1,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function rr(e, t) {
	return new e({
		type: "string",
		format: "ipv4",
		check: "string_format",
		abort: !1,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function ir(e, t) {
	return new e({
		type: "string",
		format: "ipv6",
		check: "string_format",
		abort: !1,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function ar(e, t) {
	return new e({
		type: "string",
		format: "cidrv4",
		check: "string_format",
		abort: !1,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function or(e, t) {
	return new e({
		type: "string",
		format: "cidrv6",
		check: "string_format",
		abort: !1,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function sr(e, t) {
	return new e({
		type: "string",
		format: "base64",
		check: "string_format",
		abort: !1,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function cr(e, t) {
	return new e({
		type: "string",
		format: "base64url",
		check: "string_format",
		abort: !1,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function lr(e, t) {
	return new e({
		type: "string",
		format: "e164",
		check: "string_format",
		abort: !1,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function ur(e, t) {
	return new e({
		type: "string",
		format: "jwt",
		check: "string_format",
		abort: !1,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function dr(e, t) {
	return new e({
		type: "string",
		format: "datetime",
		check: "string_format",
		offset: !1,
		local: !1,
		precision: null,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function fr(e, t) {
	return new e({
		type: "string",
		format: "date",
		check: "string_format",
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function pr(e, t) {
	return new e({
		type: "string",
		format: "time",
		check: "string_format",
		precision: null,
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function mr(e, t) {
	return new e({
		type: "string",
		format: "duration",
		check: "string_format",
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function hr(e, t) {
	return new e({
		type: "number",
		checks: [],
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function gr(e, t) {
	return new e({
		type: "number",
		check: "number_format",
		abort: !1,
		format: "safeint",
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function _r(e, t) {
	return new e({
		type: "boolean",
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function vr(e) {
	return new e({ type: "unknown" });
}
// @__NO_SIDE_EFFECTS__
function yr(e, t) {
	return new e({
		type: "never",
		...E(t)
	});
}
// @__NO_SIDE_EFFECTS__
function br(e, t) {
	return new lt({
		check: "less_than",
		...E(t),
		value: e,
		inclusive: !1
	});
}
// @__NO_SIDE_EFFECTS__
function xr(e, t) {
	return new lt({
		check: "less_than",
		...E(t),
		value: e,
		inclusive: !0
	});
}
// @__NO_SIDE_EFFECTS__
function Sr(e, t) {
	return new ut({
		check: "greater_than",
		...E(t),
		value: e,
		inclusive: !1
	});
}
// @__NO_SIDE_EFFECTS__
function Cr(e, t) {
	return new ut({
		check: "greater_than",
		...E(t),
		value: e,
		inclusive: !0
	});
}
// @__NO_SIDE_EFFECTS__
function wr(e, t) {
	return new dt({
		check: "multiple_of",
		...E(t),
		value: e
	});
}
// @__NO_SIDE_EFFECTS__
function Tr(e, t) {
	return new pt({
		check: "max_length",
		...E(t),
		maximum: e
	});
}
// @__NO_SIDE_EFFECTS__
function Er(e, t) {
	return new mt({
		check: "min_length",
		...E(t),
		minimum: e
	});
}
// @__NO_SIDE_EFFECTS__
function Dr(e, t) {
	return new ht({
		check: "length_equals",
		...E(t),
		length: e
	});
}
// @__NO_SIDE_EFFECTS__
function Or(e, t) {
	return new _t({
		check: "string_format",
		format: "regex",
		...E(t),
		pattern: e
	});
}
// @__NO_SIDE_EFFECTS__
function kr(e) {
	return new vt({
		check: "string_format",
		format: "lowercase",
		...E(e)
	});
}
// @__NO_SIDE_EFFECTS__
function Ar(e) {
	return new yt({
		check: "string_format",
		format: "uppercase",
		...E(e)
	});
}
// @__NO_SIDE_EFFECTS__
function jr(e, t) {
	return new bt({
		check: "string_format",
		format: "includes",
		...E(t),
		includes: e
	});
}
// @__NO_SIDE_EFFECTS__
function Mr(e, t) {
	return new xt({
		check: "string_format",
		format: "starts_with",
		...E(t),
		prefix: e
	});
}
// @__NO_SIDE_EFFECTS__
function Nr(e, t) {
	return new St({
		check: "string_format",
		format: "ends_with",
		...E(t),
		suffix: e
	});
}
// @__NO_SIDE_EFFECTS__
function Pr(e) {
	return new Ct({
		check: "overwrite",
		tx: e
	});
}
// @__NO_SIDE_EFFECTS__
function Fr(e) {
	return /* @__PURE__ */ Pr((t) => t.normalize(e));
}
// @__NO_SIDE_EFFECTS__
function Ir() {
	return /* @__PURE__ */ Pr((e) => e.trim());
}
// @__NO_SIDE_EFFECTS__
function Lr() {
	return /* @__PURE__ */ Pr((e) => e.toLowerCase());
}
// @__NO_SIDE_EFFECTS__
function Rr() {
	return /* @__PURE__ */ Pr((e) => e.toUpperCase());
}
// @__NO_SIDE_EFFECTS__
function zr() {
	return /* @__PURE__ */ Pr((e) => _(e));
}
// @__NO_SIDE_EFFECTS__
function Br(e, t, n) {
	return new e({
		type: "array",
		element: t,
		...E(n)
	});
}
// @__NO_SIDE_EFFECTS__
function Vr(e, t, n) {
	return new e({
		type: "custom",
		check: "custom",
		fn: t,
		...E(n)
	});
}
// @__NO_SIDE_EFFECTS__
function Hr(e, t) {
	let n = /* @__PURE__ */ Ur((t) => (t.addIssue = (e) => {
		if (typeof e == "string") t.issues.push(pe(e, t.value, n._zod.def));
		else {
			let r = e;
			r.fatal && (r.continue = !1), r.code ??= "custom", r.input ??= t.value, r.inst ??= n, r.continue ??= !n._zod.def.abort, t.issues.push(pe(r));
		}
	}, e(t.value, t)), t);
	return n;
}
// @__NO_SIDE_EFFECTS__
function Ur(e, t) {
	let n = new j({
		check: "custom",
		...E(t)
	});
	return n._zod.check = e, n;
}
//#endregion
//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/to-json-schema.js
function Wr(e) {
	let t = e?.target ?? "draft-2020-12";
	return t === "draft-4" && (t = "draft-04"), t === "draft-7" && (t = "draft-07"), {
		processors: e.processors ?? {},
		metadataRegistry: e?.metadata ?? Vn,
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
function P(e, t, n = {
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
		a && (o.ref ||= a, P(a, t, r), t.seen.get(a).isParent = !0);
	}
	let c = t.metadataRegistry.get(e);
	return c && Object.assign(o.schema, c), t.io === "input" && F(e) && (delete o.schema.examples, delete o.schema.default), t.io === "input" && "_prefault" in o.schema && ((r = o.schema).default ?? (r.default = o.schema._prefault)), delete o.schema._prefault, t.seen.get(e).schema;
}
function Gr(e, t) {
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
function Kr(e, t) {
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
					input: Jr(t, "input", e.processors),
					output: Jr(t, "output", e.processors)
				}
			},
			enumerable: !1,
			writable: !1
		}), n;
	} catch {
		throw Error("Error converting schema to JSON.");
	}
}
function F(e, t) {
	let n = t ?? { seen: /* @__PURE__ */ new Set() };
	if (n.seen.has(e)) return !1;
	n.seen.add(e);
	let r = e._zod.def;
	if (r.type === "transform") return !0;
	if (r.type === "array") return F(r.element, n);
	if (r.type === "set") return F(r.valueType, n);
	if (r.type === "lazy") return F(r.getter(), n);
	if (r.type === "promise" || r.type === "optional" || r.type === "nonoptional" || r.type === "nullable" || r.type === "readonly" || r.type === "default" || r.type === "prefault") return F(r.innerType, n);
	if (r.type === "intersection") return F(r.left, n) || F(r.right, n);
	if (r.type === "record" || r.type === "map") return F(r.keyType, n) || F(r.valueType, n);
	if (r.type === "pipe") return e._zod.traits.has("$ZodCodec") ? !0 : F(r.in, n) || F(r.out, n);
	if (r.type === "object") {
		for (let e in r.shape) if (F(r.shape[e], n)) return !0;
		return !1;
	}
	if (r.type === "union") {
		for (let e of r.options) if (F(e, n)) return !0;
		return !1;
	}
	if (r.type === "tuple") {
		for (let e of r.items) if (F(e, n)) return !0;
		return !!(r.rest && F(r.rest, n));
	}
	return !1;
}
var qr = (e, t = {}) => (n) => {
	let r = Wr({
		...n,
		processors: t
	});
	return P(e, r), Gr(r, e), Kr(r, e);
}, Jr = (e, t, n = {}) => (r) => {
	let { libraryOptions: i, target: a } = r ?? {}, o = Wr({
		...i ?? {},
		target: a,
		io: t,
		processors: n
	});
	return P(e, o), Gr(o, e), Kr(o, e);
}, Yr = {
	guid: "uuid",
	url: "uri",
	datetime: "date-time",
	json_string: "json-string",
	regex: ""
}, Xr = (e, t, n, r) => {
	let i = n;
	i.type = "string";
	let { minimum: a, maximum: o, format: s, patterns: c, contentEncoding: l } = e._zod.bag;
	if (typeof a == "number" && (i.minLength = a), typeof o == "number" && (i.maxLength = o), s && (i.format = Yr[s] ?? s, i.format === "" && delete i.format, s === "time" && delete i.format), l && (i.contentEncoding = l), c && c.size > 0) {
		let e = [...c];
		e.length === 1 ? i.pattern = e[0].source : e.length > 1 && (i.allOf = [...e.map((e) => ({
			...t.target === "draft-07" || t.target === "draft-04" || t.target === "openapi-3.0" ? { type: "string" } : {},
			pattern: e.source
		}))]);
	}
}, Zr = (e, t, n, r) => {
	let i = n, { minimum: a, maximum: o, format: s, multipleOf: c, exclusiveMaximum: l, exclusiveMinimum: u } = e._zod.bag;
	typeof s == "string" && s.includes("int") ? i.type = "integer" : i.type = "number";
	let d = typeof u == "number" && u >= (a ?? -Infinity), f = typeof l == "number" && l <= (o ?? Infinity), p = t.target === "draft-04" || t.target === "openapi-3.0";
	d ? p ? (i.minimum = u, i.exclusiveMinimum = !0) : i.exclusiveMinimum = u : typeof a == "number" && (i.minimum = a), f ? p ? (i.maximum = l, i.exclusiveMaximum = !0) : i.exclusiveMaximum = l : typeof o == "number" && (i.maximum = o), typeof c == "number" && (i.multipleOf = c);
}, Qr = (e, t, n, r) => {
	n.type = "boolean";
}, $r = (e, t, n, r) => {
	n.not = {};
}, ei = (e, t, n, r) => {
	let i = e._zod.def, a = o(i.entries);
	a.every((e) => typeof e == "number") && (n.type = "number"), a.every((e) => typeof e == "string") && (n.type = "string"), n.enum = a;
}, ti = (e, t, n, r) => {
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
}, ni = (e, t, n, r) => {
	if (t.unrepresentable === "throw") throw Error("Custom types cannot be represented in JSON Schema");
}, ri = (e, t, n, r) => {
	if (t.unrepresentable === "throw") throw Error("Transforms cannot be represented in JSON Schema");
}, ii = (e, t, n, r) => {
	let i = n, a = e._zod.def, { minimum: o, maximum: s } = e._zod.bag;
	typeof o == "number" && (i.minItems = o), typeof s == "number" && (i.maxItems = s), i.type = "array", i.items = P(a.element, t, {
		...r,
		path: [...r.path, "items"]
	});
}, ai = (e, t, n, r) => {
	let i = n, a = e._zod.def;
	i.type = "object", i.properties = {};
	let o = a.shape;
	for (let e in o) i.properties[e] = P(o[e], t, {
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
	c.size > 0 && (i.required = Array.from(c)), a.catchall?._zod.def.type === "never" ? i.additionalProperties = !1 : a.catchall ? a.catchall && (i.additionalProperties = P(a.catchall, t, {
		...r,
		path: [...r.path, "additionalProperties"]
	})) : t.io === "output" && (i.additionalProperties = !1);
}, oi = (e, t, n, r) => {
	let i = e._zod.def, a = i.inclusive === !1, o = i.options.map((e, n) => P(e, t, {
		...r,
		path: [
			...r.path,
			a ? "oneOf" : "anyOf",
			n
		]
	}));
	a ? n.oneOf = o : n.anyOf = o;
}, si = (e, t, n, r) => {
	let i = e._zod.def, a = P(i.left, t, {
		...r,
		path: [
			...r.path,
			"allOf",
			0
		]
	}), o = P(i.right, t, {
		...r,
		path: [
			...r.path,
			"allOf",
			1
		]
	}), s = (e) => "allOf" in e && Object.keys(e).length === 1;
	n.allOf = [...s(a) ? a.allOf : [a], ...s(o) ? o.allOf : [o]];
}, ci = (e, t, n, r) => {
	let i = n, a = e._zod.def;
	i.type = "object";
	let o = a.keyType, s = o._zod.bag?.patterns;
	if (a.mode === "loose" && s && s.size > 0) {
		let e = P(a.valueType, t, {
			...r,
			path: [
				...r.path,
				"patternProperties",
				"*"
			]
		});
		i.patternProperties = {};
		for (let t of s) i.patternProperties[t.source] = e;
	} else (t.target === "draft-07" || t.target === "draft-2020-12") && (i.propertyNames = P(a.keyType, t, {
		...r,
		path: [...r.path, "propertyNames"]
	})), i.additionalProperties = P(a.valueType, t, {
		...r,
		path: [...r.path, "additionalProperties"]
	});
	let c = o._zod.values;
	if (c) {
		let e = [...c].filter((e) => typeof e == "string" || typeof e == "number");
		e.length > 0 && (i.required = e);
	}
}, li = (e, t, n, r) => {
	let i = e._zod.def, a = P(i.innerType, t, r), o = t.seen.get(e);
	t.target === "openapi-3.0" ? (o.ref = i.innerType, n.nullable = !0) : n.anyOf = [a, { type: "null" }];
}, ui = (e, t, n, r) => {
	let i = e._zod.def;
	P(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType;
}, di = (e, t, n, r) => {
	let i = e._zod.def;
	P(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType, n.default = JSON.parse(JSON.stringify(i.defaultValue));
}, fi = (e, t, n, r) => {
	let i = e._zod.def;
	P(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType, t.io === "input" && (n._prefault = JSON.parse(JSON.stringify(i.defaultValue)));
}, pi = (e, t, n, r) => {
	let i = e._zod.def;
	P(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType;
	let o;
	try {
		o = i.catchValue(void 0);
	} catch {
		throw Error("Dynamic catch values are not supported in JSON Schema");
	}
	n.default = o;
}, mi = (e, t, n, r) => {
	let i = e._zod.def, a = i.in._zod.traits.has("$ZodTransform"), o = t.io === "input" ? a ? i.out : i.in : i.out;
	P(o, t, r);
	let s = t.seen.get(e);
	s.ref = o;
}, hi = (e, t, n, r) => {
	let i = e._zod.def;
	P(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType, n.readOnly = !0;
}, gi = (e, t, n, r) => {
	let i = e._zod.def;
	P(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType;
}, _i = /*@__PURE__*/ t("ZodISODateTime", (e, t) => {
	Rt.init(e, t), R.init(e, t);
});
function vi(e) {
	return /* @__PURE__ */ dr(_i, e);
}
var yi = /*@__PURE__*/ t("ZodISODate", (e, t) => {
	zt.init(e, t), R.init(e, t);
});
function bi(e) {
	return /* @__PURE__ */ fr(yi, e);
}
var xi = /*@__PURE__*/ t("ZodISOTime", (e, t) => {
	Bt.init(e, t), R.init(e, t);
});
function Si(e) {
	return /* @__PURE__ */ pr(xi, e);
}
var Ci = /*@__PURE__*/ t("ZodISODuration", (e, t) => {
	Vt.init(e, t), R.init(e, t);
});
function wi(e) {
	return /* @__PURE__ */ mr(Ci, e);
}
var Ti = /*@__PURE__*/ t("ZodError", (e, t) => {
	he.init(e, t), e.name = "ZodError", Object.defineProperties(e, {
		format: { value: (t) => _e(e, t) },
		flatten: { value: (t) => ge(e, t) },
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
}, { Parent: Error }), Ei = /* @__PURE__ */ ve(Ti), Di = /* @__PURE__ */ ye(Ti), Oi = /* @__PURE__ */ be(Ti), ki = /* @__PURE__ */ A(Ti), Ai = /* @__PURE__ */ Ce(Ti), ji = /* @__PURE__ */ we(Ti), Mi = /* @__PURE__ */ Te(Ti), Ni = /* @__PURE__ */ Ee(Ti), Pi = /* @__PURE__ */ De(Ti), Fi = /* @__PURE__ */ Oe(Ti), Ii = /* @__PURE__ */ ke(Ti), Li = /* @__PURE__ */ Ae(Ti), Ri = /* @__PURE__ */ new WeakMap();
function zi(e, t, n) {
	let r = Object.getPrototypeOf(e), i = Ri.get(r);
	if (i || (i = /* @__PURE__ */ new Set(), Ri.set(r, i)), !i.has(t)) {
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
var I = /*@__PURE__*/ t("ZodType", (e, t) => (M.init(e, t), Object.assign(e["~standard"], { jsonSchema: {
	input: Jr(e, "input"),
	output: Jr(e, "output")
} }), e.toJSONSchema = qr(e, {}), e.def = t, e.type = t.type, Object.defineProperty(e, "_def", { value: t }), e.parse = (t, n) => Ei(e, t, n, { callee: e.parse }), e.safeParse = (t, n) => Oi(e, t, n), e.parseAsync = async (t, n) => Di(e, t, n, { callee: e.parseAsync }), e.safeParseAsync = async (t, n) => ki(e, t, n), e.spa = e.safeParseAsync, e.encode = (t, n) => Ai(e, t, n), e.decode = (t, n) => ji(e, t, n), e.encodeAsync = async (t, n) => Mi(e, t, n), e.decodeAsync = async (t, n) => Ni(e, t, n), e.safeEncode = (t, n) => Pi(e, t, n), e.safeDecode = (t, n) => Fi(e, t, n), e.safeEncodeAsync = async (t, n) => Ii(e, t, n), e.safeDecodeAsync = async (t, n) => Li(e, t, n), zi(e, "ZodType", {
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
		return T(this, e, t);
	},
	brand() {
		return this;
	},
	register(e, t) {
		return e.add(this, t), this;
	},
	refine(e, t) {
		return this.check(Qa(e, t));
	},
	superRefine(e, t) {
		return this.check($a(e, t));
	},
	overwrite(e) {
		return this.check(/* @__PURE__ */ Pr(e));
	},
	optional() {
		return Pa(this);
	},
	exactOptional() {
		return Ia(this);
	},
	nullable() {
		return Ra(this);
	},
	nullish() {
		return Pa(Ra(this));
	},
	nonoptional(e) {
		return Wa(this, e);
	},
	array() {
		return _a(this);
	},
	or(e) {
		return ba([this, e]);
	},
	and(e) {
		return wa(this, e);
	},
	transform(e) {
		return Ja(this, Ma(e));
	},
	default(e) {
		return Ba(this, e);
	},
	prefault(e) {
		return Ha(this, e);
	},
	catch(e) {
		return Ka(this, e);
	},
	pipe(e) {
		return Ja(this, e);
	},
	readonly() {
		return Xa(this);
	},
	describe(e) {
		let t = this.clone();
		return Vn.add(t, { description: e }), t;
	},
	meta(...e) {
		if (e.length === 0) return Vn.get(this);
		let t = this.clone();
		return Vn.add(t, e[0]), t;
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
		return Vn.get(e)?.description;
	},
	configurable: !0
}), e)), Bi = /*@__PURE__*/ t("_ZodString", (e, t) => {
	Et.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => Xr(e, t, n, r);
	let n = e._zod.bag;
	e.format = n.format ?? null, e.minLength = n.minimum ?? null, e.maxLength = n.maximum ?? null, zi(e, "_ZodString", {
		regex(...e) {
			return this.check(/* @__PURE__ */ Or(...e));
		},
		includes(...e) {
			return this.check(/* @__PURE__ */ jr(...e));
		},
		startsWith(...e) {
			return this.check(/* @__PURE__ */ Mr(...e));
		},
		endsWith(...e) {
			return this.check(/* @__PURE__ */ Nr(...e));
		},
		min(...e) {
			return this.check(/* @__PURE__ */ Er(...e));
		},
		max(...e) {
			return this.check(/* @__PURE__ */ Tr(...e));
		},
		length(...e) {
			return this.check(/* @__PURE__ */ Dr(...e));
		},
		nonempty(...e) {
			return this.check(/* @__PURE__ */ Er(1, ...e));
		},
		lowercase(e) {
			return this.check(/* @__PURE__ */ kr(e));
		},
		uppercase(e) {
			return this.check(/* @__PURE__ */ Ar(e));
		},
		trim() {
			return this.check(/* @__PURE__ */ Ir());
		},
		normalize(...e) {
			return this.check(/* @__PURE__ */ Fr(...e));
		},
		toLowerCase() {
			return this.check(/* @__PURE__ */ Lr());
		},
		toUpperCase() {
			return this.check(/* @__PURE__ */ Rr());
		},
		slugify() {
			return this.check(/* @__PURE__ */ zr());
		}
	});
}), Vi = /*@__PURE__*/ t("ZodString", (e, t) => {
	Et.init(e, t), Bi.init(e, t), e.email = (t) => e.check(/* @__PURE__ */ Un(Hi, t)), e.url = (t) => e.check(/* @__PURE__ */ Yn(Gi, t)), e.jwt = (t) => e.check(/* @__PURE__ */ ur(oa, t)), e.emoji = (t) => e.check(/* @__PURE__ */ Xn(Ki, t)), e.guid = (t) => e.check(/* @__PURE__ */ Wn(Ui, t)), e.uuid = (t) => e.check(/* @__PURE__ */ Gn(Wi, t)), e.uuidv4 = (t) => e.check(/* @__PURE__ */ Kn(Wi, t)), e.uuidv6 = (t) => e.check(/* @__PURE__ */ qn(Wi, t)), e.uuidv7 = (t) => e.check(/* @__PURE__ */ Jn(Wi, t)), e.nanoid = (t) => e.check(/* @__PURE__ */ Zn(qi, t)), e.guid = (t) => e.check(/* @__PURE__ */ Wn(Ui, t)), e.cuid = (t) => e.check(/* @__PURE__ */ Qn(Ji, t)), e.cuid2 = (t) => e.check(/* @__PURE__ */ $n(Yi, t)), e.ulid = (t) => e.check(/* @__PURE__ */ er(Xi, t)), e.base64 = (t) => e.check(/* @__PURE__ */ sr(ra, t)), e.base64url = (t) => e.check(/* @__PURE__ */ cr(ia, t)), e.xid = (t) => e.check(/* @__PURE__ */ tr(Zi, t)), e.ksuid = (t) => e.check(/* @__PURE__ */ nr(Qi, t)), e.ipv4 = (t) => e.check(/* @__PURE__ */ rr($i, t)), e.ipv6 = (t) => e.check(/* @__PURE__ */ ir(ea, t)), e.cidrv4 = (t) => e.check(/* @__PURE__ */ ar(ta, t)), e.cidrv6 = (t) => e.check(/* @__PURE__ */ or(na, t)), e.e164 = (t) => e.check(/* @__PURE__ */ lr(aa, t)), e.datetime = (t) => e.check(vi(t)), e.date = (t) => e.check(bi(t)), e.time = (t) => e.check(Si(t)), e.duration = (t) => e.check(wi(t));
});
function L(e) {
	return /* @__PURE__ */ Hn(Vi, e);
}
var R = /*@__PURE__*/ t("ZodStringFormat", (e, t) => {
	N.init(e, t), Bi.init(e, t);
}), Hi = /*@__PURE__*/ t("ZodEmail", (e, t) => {
	kt.init(e, t), R.init(e, t);
}), Ui = /*@__PURE__*/ t("ZodGUID", (e, t) => {
	Dt.init(e, t), R.init(e, t);
}), Wi = /*@__PURE__*/ t("ZodUUID", (e, t) => {
	Ot.init(e, t), R.init(e, t);
}), Gi = /*@__PURE__*/ t("ZodURL", (e, t) => {
	At.init(e, t), R.init(e, t);
}), Ki = /*@__PURE__*/ t("ZodEmoji", (e, t) => {
	jt.init(e, t), R.init(e, t);
}), qi = /*@__PURE__*/ t("ZodNanoID", (e, t) => {
	Mt.init(e, t), R.init(e, t);
}), Ji = /*@__PURE__*/ t("ZodCUID", (e, t) => {
	Nt.init(e, t), R.init(e, t);
}), Yi = /*@__PURE__*/ t("ZodCUID2", (e, t) => {
	Pt.init(e, t), R.init(e, t);
}), Xi = /*@__PURE__*/ t("ZodULID", (e, t) => {
	Ft.init(e, t), R.init(e, t);
}), Zi = /*@__PURE__*/ t("ZodXID", (e, t) => {
	It.init(e, t), R.init(e, t);
}), Qi = /*@__PURE__*/ t("ZodKSUID", (e, t) => {
	Lt.init(e, t), R.init(e, t);
}), $i = /*@__PURE__*/ t("ZodIPv4", (e, t) => {
	Ht.init(e, t), R.init(e, t);
}), ea = /*@__PURE__*/ t("ZodIPv6", (e, t) => {
	Ut.init(e, t), R.init(e, t);
}), ta = /*@__PURE__*/ t("ZodCIDRv4", (e, t) => {
	Wt.init(e, t), R.init(e, t);
}), na = /*@__PURE__*/ t("ZodCIDRv6", (e, t) => {
	Gt.init(e, t), R.init(e, t);
}), ra = /*@__PURE__*/ t("ZodBase64", (e, t) => {
	qt.init(e, t), R.init(e, t);
}), ia = /*@__PURE__*/ t("ZodBase64URL", (e, t) => {
	Yt.init(e, t), R.init(e, t);
}), aa = /*@__PURE__*/ t("ZodE164", (e, t) => {
	Xt.init(e, t), R.init(e, t);
}), oa = /*@__PURE__*/ t("ZodJWT", (e, t) => {
	Qt.init(e, t), R.init(e, t);
}), sa = /*@__PURE__*/ t("ZodNumber", (e, t) => {
	$t.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => Zr(e, t, n, r), zi(e, "ZodNumber", {
		gt(e, t) {
			return this.check(/* @__PURE__ */ Sr(e, t));
		},
		gte(e, t) {
			return this.check(/* @__PURE__ */ Cr(e, t));
		},
		min(e, t) {
			return this.check(/* @__PURE__ */ Cr(e, t));
		},
		lt(e, t) {
			return this.check(/* @__PURE__ */ br(e, t));
		},
		lte(e, t) {
			return this.check(/* @__PURE__ */ xr(e, t));
		},
		max(e, t) {
			return this.check(/* @__PURE__ */ xr(e, t));
		},
		int(e) {
			return this.check(la(e));
		},
		safe(e) {
			return this.check(la(e));
		},
		positive(e) {
			return this.check(/* @__PURE__ */ Sr(0, e));
		},
		nonnegative(e) {
			return this.check(/* @__PURE__ */ Cr(0, e));
		},
		negative(e) {
			return this.check(/* @__PURE__ */ br(0, e));
		},
		nonpositive(e) {
			return this.check(/* @__PURE__ */ xr(0, e));
		},
		multipleOf(e, t) {
			return this.check(/* @__PURE__ */ wr(e, t));
		},
		step(e, t) {
			return this.check(/* @__PURE__ */ wr(e, t));
		},
		finite() {
			return this;
		}
	});
	let n = e._zod.bag;
	e.minValue = Math.max(n.minimum ?? -Infinity, n.exclusiveMinimum ?? -Infinity) ?? null, e.maxValue = Math.min(n.maximum ?? Infinity, n.exclusiveMaximum ?? Infinity) ?? null, e.isInt = (n.format ?? "").includes("int") || Number.isSafeInteger(n.multipleOf ?? .5), e.isFinite = !0, e.format = n.format ?? null;
});
function z(e) {
	return /* @__PURE__ */ hr(sa, e);
}
var ca = /*@__PURE__*/ t("ZodNumberFormat", (e, t) => {
	en.init(e, t), sa.init(e, t);
});
function la(e) {
	return /* @__PURE__ */ gr(ca, e);
}
var ua = /*@__PURE__*/ t("ZodBoolean", (e, t) => {
	tn.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => Qr(e, t, n, r);
});
function da(e) {
	return /* @__PURE__ */ _r(ua, e);
}
var fa = /*@__PURE__*/ t("ZodUnknown", (e, t) => {
	nn.init(e, t), I.init(e, t), e._zod.processJSONSchema = (e, t, n) => void 0;
});
function pa() {
	return /* @__PURE__ */ vr(fa);
}
var ma = /*@__PURE__*/ t("ZodNever", (e, t) => {
	rn.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => $r(e, t, n, r);
});
function ha(e) {
	return /* @__PURE__ */ yr(ma, e);
}
var ga = /*@__PURE__*/ t("ZodArray", (e, t) => {
	on.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => ii(e, t, n, r), e.element = t.element, zi(e, "ZodArray", {
		min(e, t) {
			return this.check(/* @__PURE__ */ Er(e, t));
		},
		nonempty(e) {
			return this.check(/* @__PURE__ */ Er(1, e));
		},
		max(e, t) {
			return this.check(/* @__PURE__ */ Tr(e, t));
		},
		length(e, t) {
			return this.check(/* @__PURE__ */ Dr(e, t));
		},
		unwrap() {
			return this.element;
		}
	});
});
function _a(e, t) {
	return /* @__PURE__ */ Br(ga, e, t);
}
var va = /*@__PURE__*/ t("ZodObject", (e, t) => {
	dn.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => ai(e, t, n, r), p(e, "shape", () => t.shape), zi(e, "ZodObject", {
		keyof() {
			return Oa(Object.keys(this._zod.def.shape));
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
				catchall: pa()
			});
		},
		loose() {
			return this.clone({
				...this._zod.def,
				catchall: pa()
			});
		},
		strict() {
			return this.clone({
				...this._zod.def,
				catchall: ha()
			});
		},
		strip() {
			return this.clone({
				...this._zod.def,
				catchall: void 0
			});
		},
		extend(e) {
			return O(this, e);
		},
		safeExtend(e) {
			return re(this, e);
		},
		merge(e) {
			return ie(this, e);
		},
		pick(e) {
			return ne(this, e);
		},
		omit(e) {
			return D(this, e);
		},
		partial(...e) {
			return ae(Na, this, e[0]);
		},
		required(...e) {
			return oe(Ua, this, e[0]);
		}
	});
});
function B(e, t) {
	return new va({
		type: "object",
		shape: e ?? {},
		...E(t)
	});
}
var ya = /*@__PURE__*/ t("ZodUnion", (e, t) => {
	pn.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => oi(e, t, n, r), e.options = t.options;
});
function ba(e, t) {
	return new ya({
		type: "union",
		options: e,
		...E(t)
	});
}
var xa = /*@__PURE__*/ t("ZodDiscriminatedUnion", (e, t) => {
	ya.init(e, t), mn.init(e, t);
});
function Sa(e, t, n) {
	return new xa({
		type: "union",
		options: t,
		discriminator: e,
		...E(n)
	});
}
var Ca = /*@__PURE__*/ t("ZodIntersection", (e, t) => {
	hn.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => si(e, t, n, r);
});
function wa(e, t) {
	return new Ca({
		type: "intersection",
		left: e,
		right: t
	});
}
var Ta = /*@__PURE__*/ t("ZodRecord", (e, t) => {
	vn.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => ci(e, t, n, r), e.keyType = t.keyType, e.valueType = t.valueType;
});
function Ea(e, t, n) {
	return !t || !t._zod ? new Ta({
		type: "record",
		keyType: L(),
		valueType: e,
		...E(t)
	}) : new Ta({
		type: "record",
		keyType: e,
		valueType: t,
		...E(n)
	});
}
var Da = /*@__PURE__*/ t("ZodEnum", (e, t) => {
	yn.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => ei(e, t, n, r), e.enum = t.entries, e.options = Object.values(t.entries);
	let n = new Set(Object.keys(t.entries));
	e.extract = (e, r) => {
		let i = {};
		for (let r of e) if (n.has(r)) i[r] = t.entries[r];
		else throw Error(`Key ${r} not found in enum`);
		return new Da({
			...t,
			checks: [],
			...E(r),
			entries: i
		});
	}, e.exclude = (e, r) => {
		let i = { ...t.entries };
		for (let t of e) if (n.has(t)) delete i[t];
		else throw Error(`Key ${t} not found in enum`);
		return new Da({
			...t,
			checks: [],
			...E(r),
			entries: i
		});
	};
});
function Oa(e, t) {
	return new Da({
		type: "enum",
		entries: Array.isArray(e) ? Object.fromEntries(e.map((e) => [e, e])) : e,
		...E(t)
	});
}
var ka = /*@__PURE__*/ t("ZodLiteral", (e, t) => {
	bn.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => ti(e, t, n, r), e.values = new Set(t.values), Object.defineProperty(e, "value", { get() {
		if (t.values.length > 1) throw Error("This schema contains multiple valid literal values. Use `.values` instead.");
		return t.values[0];
	} });
});
function Aa(e, t) {
	return new ka({
		type: "literal",
		values: Array.isArray(e) ? e : [e],
		...E(t)
	});
}
var ja = /*@__PURE__*/ t("ZodTransform", (e, t) => {
	xn.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => ri(e, t, n, r), e._zod.parse = (n, i) => {
		if (i.direction === "backward") throw new r(e.constructor.name);
		n.addIssue = (r) => {
			if (typeof r == "string") n.issues.push(pe(r, n.value, t));
			else {
				let t = r;
				t.fatal && (t.continue = !1), t.code ??= "custom", t.input ??= n.value, t.inst ??= e, n.issues.push(pe(t));
			}
		};
		let a = t.transform(n.value, n);
		return a instanceof Promise ? a.then((e) => (n.value = e, n.fallback = !0, n)) : (n.value = a, n.fallback = !0, n);
	};
});
function Ma(e) {
	return new ja({
		type: "transform",
		transform: e
	});
}
var Na = /*@__PURE__*/ t("ZodOptional", (e, t) => {
	Cn.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => gi(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function Pa(e) {
	return new Na({
		type: "optional",
		innerType: e
	});
}
var Fa = /*@__PURE__*/ t("ZodExactOptional", (e, t) => {
	wn.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => gi(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function Ia(e) {
	return new Fa({
		type: "optional",
		innerType: e
	});
}
var La = /*@__PURE__*/ t("ZodNullable", (e, t) => {
	Tn.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => li(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function Ra(e) {
	return new La({
		type: "nullable",
		innerType: e
	});
}
var za = /*@__PURE__*/ t("ZodDefault", (e, t) => {
	En.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => di(e, t, n, r), e.unwrap = () => e._zod.def.innerType, e.removeDefault = e.unwrap;
});
function Ba(e, t) {
	return new za({
		type: "default",
		innerType: e,
		get defaultValue() {
			return typeof t == "function" ? t() : S(t);
		}
	});
}
var Va = /*@__PURE__*/ t("ZodPrefault", (e, t) => {
	On.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => fi(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function Ha(e, t) {
	return new Va({
		type: "prefault",
		innerType: e,
		get defaultValue() {
			return typeof t == "function" ? t() : S(t);
		}
	});
}
var Ua = /*@__PURE__*/ t("ZodNonOptional", (e, t) => {
	kn.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => ui(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function Wa(e, t) {
	return new Ua({
		type: "nonoptional",
		innerType: e,
		...E(t)
	});
}
var Ga = /*@__PURE__*/ t("ZodCatch", (e, t) => {
	jn.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => pi(e, t, n, r), e.unwrap = () => e._zod.def.innerType, e.removeCatch = e.unwrap;
});
function Ka(e, t) {
	return new Ga({
		type: "catch",
		innerType: e,
		catchValue: typeof t == "function" ? t : () => t
	});
}
var qa = /*@__PURE__*/ t("ZodPipe", (e, t) => {
	Mn.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => mi(e, t, n, r), e.in = t.in, e.out = t.out;
});
function Ja(e, t) {
	return new qa({
		type: "pipe",
		in: e,
		out: t
	});
}
var Ya = /*@__PURE__*/ t("ZodReadonly", (e, t) => {
	Pn.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => hi(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function Xa(e) {
	return new Ya({
		type: "readonly",
		innerType: e
	});
}
var Za = /*@__PURE__*/ t("ZodCustom", (e, t) => {
	In.init(e, t), I.init(e, t), e._zod.processJSONSchema = (t, n, r) => ni(e, t, n, r);
});
function Qa(e, t = {}) {
	return /* @__PURE__ */ Vr(Za, e, t);
}
function $a(e, t) {
	return /* @__PURE__ */ Hr(e, t);
}
var eo = L().min(1).refine((e) => e === e.trim(), { message: "Идентификатор не должен начинаться или заканчиваться пробелом" }), to = z().finite().nonnegative(), no = B({
	text: L().min(1),
	start: to,
	end: to,
	source: Oa([
		"alignment",
		"tts",
		"manual"
	]),
	confidence: z().min(0).max(1).optional()
}).refine((e) => e.end >= e.start, { message: "Конец слова не может быть раньше начала" }), ro = B({
	text: L().min(1),
	before: L(),
	after: L()
}), io = Sa("kind", [B({
	kind: Aa("seconds"),
	t: to
}), B({
	kind: Aa("word"),
	wordIndex: z().int().nonnegative(),
	offset: z().finite(),
	anchor: ro
})]), ao = B({
	id: eo,
	type: Oa([
		"text",
		"image",
		"shape",
		"group"
	]),
	x: z().finite(),
	y: z().finite(),
	width: z().finite().positive(),
	height: z().finite().positive(),
	rotation: z().finite().default(0),
	zIndex: z().int().default(0),
	style: Ea(L(), ba([L(), z()])).default({}),
	content: L().default("")
}), oo = B({
	id: eo,
	at: io,
	targetId: eo,
	animation: B({
		property: Oa([
			"x",
			"y",
			"scale",
			"scaleX",
			"scaleY",
			"rotate",
			"opacity",
			"filter"
		]),
		from: ba([z(), L()]).optional(),
		to: ba([z(), L()]),
		duration: z().finite().positive(),
		ease: L().default("inOutQuad")
	})
}), so = B({
	id: eo,
	at: io,
	config: Sa("kind", [
		B({
			kind: Aa("choice"),
			prompt: L(),
			options: _a(B({
				id: eo,
				label: L()
			})).min(2),
			correctId: eo
		}),
		B({
			kind: Aa("input"),
			prompt: L(),
			accept: _a(L().min(1)).min(1),
			caseSensitive: da().default(!1)
		}),
		B({
			kind: Aa("continue"),
			label: L().default("Дальше")
		})
	]),
	onWrong: Oa([
		"retry",
		"reveal",
		"continue"
	]).default("retry"),
	maxAttempts: z().int().positive().nullable().default(null)
}).refine((e) => {
	let t = e.config;
	return t.kind !== "choice" || t.options.some((e) => e.id === t.correctId);
}, { message: "correctId должен указывать на один из вариантов" }), co = B({
	elements: _a(ao),
	cues: _a(oo),
	gates: _a(so)
}), lo = B({
	schemaVersion: Aa(1),
	meta: B({
		title: L(),
		stageWidth: z().int().positive().default(1920),
		stageHeight: z().int().positive().default(1080)
	}),
	audio: B({
		src: L().min(1),
		duration: z().finite().positive(),
		words: _a(no)
	}),
	scene: co
}).superRefine((e, t) => {
	let n = new Set(e.scene.elements.map((e) => e.id)), r = e.audio.words.length, i = (n, i) => {
		if (n.kind === "seconds") {
			n.t > e.audio.duration && t.addIssue({
				code: "custom",
				path: i,
				message: `Время ${n.t} с выходит за длительность дорожки ${e.audio.duration} с`
			});
			return;
		}
		n.wordIndex >= r && t.addIssue({
			code: "custom",
			path: i,
			message: r === 0 ? "Ссылка на слово при пустом транскрипте" : `Слово №${n.wordIndex} отсутствует, всего слов ${r}`
		});
	};
	e.scene.cues.forEach((e, r) => {
		i(e.at, [
			"scene",
			"cues",
			r,
			"at"
		]), n.has(e.targetId) || t.addIssue({
			code: "custom",
			path: [
				"scene",
				"cues",
				r,
				"targetId"
			],
			message: `Анимация ссылается на несуществующий элемент «${e.targetId}»`
		});
	}), e.scene.gates.forEach((e, t) => {
		i(e.at, [
			"scene",
			"gates",
			t,
			"at"
		]);
	});
}), uo = Object.freeze({}), fo = class extends Error {
	found;
	constructor(e, t) {
		super(e), this.found = t, this.name = "SchemaVersionError";
	}
};
function po(e) {
	if (typeof e != "object" || !e) throw new fo("Проект должен быть объектом", e);
	let t = e.schemaVersion;
	if (typeof t != "number" || !Number.isInteger(t) || t < 1) throw new fo(`Некорректная schemaVersion: ${JSON.stringify(t)}`, t);
	return t;
}
function mo(e) {
	let t = po(e);
	if (t > 1) throw new fo(`Проект сохранён в версии схемы ${t}, а эта сборка понимает только 1. Обновите приложение.`, t);
	let n = e;
	for (; t < 1;) {
		let e = uo[t];
		if (!e) throw new fo(`Нет миграции с версии ${t} на ${t + 1}. Каждая версия схемы обязана иметь миграцию (инвариант №7).`, t);
		n = e(n), t = po(n);
	}
	return n;
}
//#endregion
//#region packages/core/src/time.ts
function ho(e) {
	return e.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]/gu, "");
}
var go = class extends Error {
	ref;
	constructor(e, t) {
		super(e), this.ref = t, this.name = "TimeRefError";
	}
};
function _o(e, t) {
	if (e.kind === "seconds") return e.t;
	let n = t[e.wordIndex];
	if (!n) throw new go(t.length === 0 ? "Ссылка на слово, но транскрипт пуст" : `Слово №${e.wordIndex} отсутствует, всего слов ${t.length}`, e);
	if (ho(n.text) !== e.anchor.text) throw new go(`Слово №${e.wordIndex} теперь «${n.text}», а метка ставилась на «${e.anchor.text}». Требуется перепривязка.`, e);
	return Math.max(0, n.start + e.offset);
}
//#endregion
//#region packages/core/src/load.ts
var vo = class extends Error {
	issues;
	constructor(e, t) {
		super(e), this.issues = t, this.name = "ProjectLoadError";
	}
};
function yo(e) {
	let t = mo(e), n = lo.safeParse(t);
	if (!n.success) {
		let e = n.error.issues.map((e) => `${e.path.join(".") || "<корень>"}: ${e.message}`);
		throw new vo(`Проект не прошёл валидацию (${e.length} проблем):\n  ${e.join("\n  ")}`, e);
	}
	return n.data;
}
//#endregion
//#region packages/player/src/clock.ts
var bo = 1, xo = 8, So = .02;
async function Co(e, t) {
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
var wo = class {
	#e;
	#t;
	#n;
	#r;
	#i = null;
	#a = null;
	#o = null;
	constructor(e, t) {
		this.#e = e, this.#t = t, this.#n = e.createGain(), this.#n.connect(e.destination), this.#r = To(e);
	}
	get context() {
		return this.#e;
	}
	get duration() {
		return this.#t.duration;
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
		let n = t.leadTime ?? So, r = t.rampMs ?? xo, i = this.#e.createBufferSource();
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
		let i = (t.rampMs ?? xo) / 1e3, a = this.#e.currentTime, o = r.ctxTime + (e - r.mediaTime), s = Math.max(a + .001, o);
		this.#n.gain.cancelScheduledValues(a), this.#n.gain.setValueAtTime(this.#n.gain.value, Math.max(a, s - i)), this.#n.gain.linearRampToValueAtTime(0, s), this.#o = e, n.stop(s), n.disconnect(), this.#i = null, await this.#e.suspend();
	}
	async resumeFromFreeze() {
		if (this.#o === null) throw Error("Часы не в состоянии паузы");
		let e = this.#o;
		await this.#e.resume(), this.#o = null, this.start(e);
	}
	stop() {
		this.#i &&= (this.#i.stop(), this.#i.disconnect(), null), this.#a = null, this.#o = null;
	}
};
function To(e) {
	let t = e.getOutputTimestamp?.();
	if (!t || typeof t.contextTime != "number") return console.warn("[clock] getOutputTimestamp недоступен, беру запасную формулу"), !1;
	let n = Math.abs(t.contextTime - e.currentTime);
	return n < bo ? !0 : (console.warn(`[clock] getOutputTimestamp невменяем: contextTime=${t.contextTime}, currentTime=${e.currentTime}, расхождение ${n.toFixed(3)} с. Беру запасную формулу.`), !1);
}
//#endregion
//#region packages/player/src/render.ts
var Eo = 1920, Do = 1080;
function Oo(e, t, n) {
	if (!(e > 0) || !(t > 0)) throw RangeError(`Некорректный размер контейнера: ${e}x${t}`);
	let r = Math.min(e / n.width, t / n.height);
	return {
		scale: r,
		offsetX: (e - n.width * r) / 2,
		offsetY: (t - n.height * r) / 2
	};
}
function ko(e, t) {
	e.className = `scene-el scene-${t.type}`, e.dataset.id = t.id;
	let n = e.style;
	n.position = "absolute", n.left = `${t.x}px`, n.top = `${t.y}px`, n.width = `${t.width}px`, n.height = `${t.height}px`, n.zIndex = String(t.zIndex), n.transform = t.rotation ? `rotate(${t.rotation}deg)` : "", n.margin = "0", n.boxSizing = "border-box";
	for (let [e, r] of Object.entries(t.style)) n.setProperty(e, String(r));
	switch (t.type) {
		case "text":
			e.textContent = t.content;
			break;
		case "image":
			e.textContent = "", n.backgroundImage = t.content ? `url(${t.content})` : "", n.backgroundSize = "cover";
			break;
		case "shape":
		case "group":
			e.textContent = "";
			break;
	}
}
function Ao(e, t, n = {
	width: Eo,
	height: Do
}) {
	e.textContent = "", e.style.position = "relative", e.style.width = `${n.width}px`, e.style.height = `${n.height}px`, e.style.transformOrigin = "0 0", e.style.overflow = "hidden";
	let r = /* @__PURE__ */ new Map();
	for (let n of t.elements) {
		let t = document.createElement("div");
		ko(t, n), e.appendChild(t), r.set(n.id, t);
	}
	return r;
}
function jo(e, t, n, r = {
	width: Eo,
	height: Do
}) {
	let i = Oo(t, n, r);
	return e.style.transform = `translate(${i.offsetX}px, ${i.offsetY}px) scale(${i.scale})`, i;
}
//#endregion
//#region node_modules/.pnpm/animejs@4.5.0/node_modules/animejs/dist/modules/core/consts.js
var Mo = typeof window < "u", No = Mo ? window : null, Po = Mo ? document : null, V = {
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
}, Fo = {
	NONE: 0,
	AUTO: 1,
	FORCE: 2
}, U = {
	replace: 0,
	none: 1,
	blend: 2
}, Io = Symbol(), Lo = Symbol(), Ro = Symbol(), zo = Symbol(), Bo = Symbol(), W = 1e-11, Vo = 0xe8d4a51000, Ho = 1e3, Uo = [], Wo = /*#__PURE__*/ (() => {
	let e = /* @__PURE__ */ new Map();
	return e.set("x", "translateX"), e.set("y", "translateY"), e.set("z", "translateZ"), e;
})(), Go = [
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
], Ko = /*#__PURE__*/ Go.reduce((e, t) => ({
	...e,
	[t]: t + "("
}), {}), qo = () => {}, Jo = (e) => e, Yo = /\)\s*[-.\d]/, Xo = /(^#([\da-f]{3}){1,2}$)|(^#([\da-f]{4}){1,2}$)/i, Zo = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i, Qo = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(-?\d+|-?\d*.\d+)\s*\)/i, $o = /hsl\(\s*(-?\d+|-?\d*.\d+)\s*,\s*(-?\d+|-?\d*.\d+)%\s*,\s*(-?\d+|-?\d*.\d+)%\s*\)/i, es = /hsla\(\s*(-?\d+|-?\d*.\d+)\s*,\s*(-?\d+|-?\d*.\d+)%\s*,\s*(-?\d+|-?\d*.\d+)%\s*,\s*(-?\d+|-?\d*.\d+)\s*\)/i, ts = /[-+]?\d*\.?\d+(?:e[-+]?\d)?/gi, ns = /^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)([a-z]+|%)$/i, rs = /([a-z])([A-Z])/g, is = /(\*=|\+=|-=)/, as = /var\(\s*(--[\w-]+)(?:\s*,\s*([^)]+))?\s*\)/, os = {
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
	duration: Ho,
	delay: 0,
	loopDelay: 0,
	ease: "out(2)",
	composition: U.replace,
	modifier: Jo,
	onBegin: qo,
	onBeforeUpdate: qo,
	onUpdate: qo,
	onLoop: qo,
	onPause: qo,
	onComplete: qo,
	onRender: qo
}, ss = {
	current: null,
	root: Po
}, G = {
	defaults: os,
	precision: 4,
	timeScale: 1,
	tickThreshold: 200,
	editor: null
}, cs = {
	version: "4.5.0",
	engine: null
};
Mo && (No.AnimeJS ||= [], No.AnimeJS.push(cs));
//#endregion
//#region node_modules/.pnpm/animejs@4.5.0/node_modules/animejs/dist/modules/core/helpers.js
var ls = (e) => e.replace(rs, "$1-$2").toLowerCase(), us = (e, t) => e.indexOf(t) === 0, ds = Date.now, fs = Array.isArray, ps = (e) => e && e.constructor === Object, ms = (e) => typeof e == "number" && !isNaN(e), hs = (e) => typeof e == "string", gs = (e) => typeof e == "function", K = (e) => e === void 0, _s = (e) => K(e) || e === null, vs = (e) => Mo && e instanceof SVGElement, ys = (e) => Xo.test(e), bs = (e) => us(e, "rgb"), xs = (e) => us(e, "hsl"), Ss = (e) => ys(e) || (bs(e) || xs(e)) && (e[e.length - 1] === ")" || !Yo.test(e)), Cs = (e) => !G.defaults.hasOwnProperty(e), ws = [
	"opacity",
	"rotate",
	"overflow",
	"color"
], Ts = (e, t) => {
	if (ws.includes(t)) return !1;
	if (e.getAttribute(t) || t in e) {
		if (t === "scale") {
			let t = e.parentNode;
			return t && t.tagName === "filter";
		}
		return !0;
	}
}, Es = Math.pow, Ds = Math.sqrt, Os = Math.sin, ks = Math.cos, As = Math.floor, js = Math.asin, Ms = Math.PI, Ns = Math.round, Ps = (e, t, n) => e < t ? t : e > n ? n : e, q = (e, t) => {
	if (t < 0) return e;
	if (!t) return Ns(e);
	let n = 10 ** t;
	return Ns(e * n) / n;
}, Fs = (e, t, n) => n === 1 ? t : n === 0 ? e : e + (t - e) * n, Is = (e) => e === Infinity ? Vo : e === -Infinity ? -Vo : e, Ls = (e) => e <= 1e-11 ? W : Is(q(e, 11)), J = (e) => fs(e) ? [...e] : e, Rs = (e, t) => {
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
}, zs = (e, t, n = "_prev", r = "_next") => {
	let i = t[n], a = t[r];
	i ? i[r] = a : e._head = a, a ? a[n] = i : e._tail = i, t[n] = null, t[r] = null;
}, Bs = (e, t, n, r = "_prev", i = "_next") => {
	let a = e._tail;
	for (; a && n && n(a, t);) a = a[r];
	let o = a ? a[i] : e._head;
	a ? a[i] = t : e._head = t, o ? o[r] = t : e._tail = t, t[r] = a, t[i] = o;
}, Vs = (e, t, n) => {
	let r = e.style.transform;
	if (r) {
		let i = e[zo], a = 0, o = r.length, s;
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
	return t === "translate3d" ? "0px, 0px, 0px" : t === "rotate3d" ? "0, 0, 0, 0deg" : us(t, "scale") ? "1" : us(t, "rotate") || us(t, "skew") ? "0deg" : "0px";
}, Hs = (e) => {
	let t = "";
	for (let n = 0, r = Go.length; n < r; n++) {
		let r = Go[n], i = e[r];
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
			t += `${Ko[r]}${i}) `;
		}
		r === "rotateZ" && e.rotate3d !== void 0 && (t += `rotate3d(${e.rotate3d}) `);
	}
	return e.matrix !== void 0 && (t += `matrix(${e.matrix}) `), e.matrix3d !== void 0 && (t += `matrix3d(${e.matrix3d}) `), t;
}, Us = [];
function Ws(e, t) {
	if (!e) return null;
	let n = Us.length;
	outer: for (let r = 0; r < n; r++) {
		let n = Us[r];
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
		let n = Us[r];
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
var Gs = (e) => {
	let t = Zo.exec(e) || Qo.exec(e), n = K(t[4]) ? 1 : +t[4];
	return [
		+t[1],
		+t[2],
		+t[3],
		n
	];
}, Ks = (e) => {
	let t = e.length, n = t === 4 || t === 5;
	return [
		+("0x" + e[1] + e[n ? 1 : 2]),
		+("0x" + e[n ? 2 : 3] + e[n ? 2 : 4]),
		+("0x" + e[n ? 3 : 5] + e[n ? 3 : 6]),
		t === 5 || t === 9 ? +(("0x" + e[n ? 4 : 7] + e[n ? 4 : 8]) / 255).toFixed(3) : 1
	];
}, qs = (e, t, n) => (n < 0 && (n += 1), n > 1 && --n, n < 1 / 6 ? e + (t - e) * 6 * n : n < 1 / 2 ? t : n < 2 / 3 ? e + (t - e) * (2 / 3 - n) * 6 : e), Js = (e) => {
	let t = $o.exec(e) || es.exec(e), n = t[1] / 360, r = t[2] / 100, i = t[3] / 100, a = K(t[4]) ? 1 : +t[4], o, s, c;
	if (r === 0) o = s = c = i;
	else {
		let e = i < .5 ? i * (1 + r) : i + r - i * r, t = 2 * i - e;
		o = q(qs(t, e, n + 1 / 3) * 255, 0), s = q(qs(t, e, n) * 255, 0), c = q(qs(t, e, n - 1 / 3) * 255, 0);
	}
	return [
		o,
		s,
		c,
		a
	];
}, Ys = (e) => bs(e) ? Gs(e) : ys(e) ? Ks(e) : xs(e) ? Js(e) : [
	0,
	0,
	0,
	1
], X = (e, t) => K(e) ? t : e, Xs = (e, t) => {
	let n = e.match(as), r = t[Lo] ? t : document.documentElement, i = getComputedStyle(r)?.getPropertyValue(n[1]);
	return (!i || i.trim() === "") && n[2] && (i = n[2].trim()), i || 0;
}, Zs = (e, t, n, r, i, a) => {
	if (gs(e)) {
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
	if (hs(e) && us(e, "var(")) {
		if (!i) return Xs(e, t);
		let n = () => Xs(e, t);
		return i.func = n, n();
	}
	return e;
}, Qs = (e, t) => e[Lo] ? e[Ro] && Ts(e, t) ? V.ATTRIBUTE : Go.includes(t) || Wo.get(t) ? V.TRANSFORM : us(t, "--") ? V.CSS_VAR : t in e.style ? V.CSS : t in e ? V.OBJECT : V.ATTRIBUTE : V.OBJECT, $s = (e, t, n) => {
	let r = e.style[t];
	r && n && (n[t] = r);
	let i = r || getComputedStyle(e[Bo] || e).getPropertyValue(t);
	return i === "auto" ? "0" : i;
}, ec = (e, t, n, r) => {
	let i = K(n) ? Qs(e, t) : n, a = Ws(e, t);
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
	return i === V.TRANSFORM ? Vs(e, t, r) : i === V.CSS_VAR ? $s(e, t, r).trimStart() : $s(e, t, r);
}, tc = (e, t, n) => n === "-" ? e - t : n === "+" ? e + t : e * t, nc = () => ({
	t: H.NUMBER,
	n: 0,
	u: null,
	o: null,
	d: null,
	s: null
}), rc = (e, t) => {
	if (t.t = H.NUMBER, t.n = 0, t.u = null, t.o = null, t.d = null, t.s = null, !e) return t;
	let n = +e;
	if (!isNaN(n)) return t.n = n, t;
	let r = e;
	r[1] === "=" && (t.o = r[0], r = r.slice(2));
	let i = !r.includes(" ") && ns.exec(r);
	if (i) return t.t = H.UNIT, t.n = +i[1], t.u = i[2], t;
	if (t.o) return t.n = +r, t;
	if (Ss(r)) return t.t = H.COLOR, t.d = Ys(r), t;
	{
		let e = r.match(ts);
		return t.t = H.COMPLEX, t.d = e ? e.map(Number) : [], t.s = r.split(ts) || [], t;
	}
}, ic = (e, t) => (t.t = e._valueType, t.n = e._toNumber, t.u = e._unit, t.o = null, t.d = J(e._toNumbers), t.s = J(e._strings), t), ac = nc(), oc = (e, t, n) => {
	let r = e._modifier, i = e._fromNumbers, a = e._toNumbers, o = e._strings, s = o[0];
	for (let c = 0, l = a.length; c < l; c++) {
		let l = r(q(Fs(i[c], a[c], t), n)), u = o[c + 1];
		s += `${u ? l + u : l}`, e._numbers[c] = l;
	}
	return s;
}, sc = (e, t, n, r, i) => {
	let a = e.parent, o = e.duration, s = e.completed, c = e.iterationDuration, l = e.iterationCount, u = e._currentIteration, d = e._loopDelay, f = e._reversed, p = e._alternate, m = e._hasChildren, h = e._delay, g = e._currentTime, _ = h + c, v = t - h, y = Ps(g, -h, o), b = Ps(v, -h, o), x = v - g, S = b > 0, C = b >= o, w = o <= W, T = i === Fo.FORCE, E = 0, ee = v, te = 0;
	if (l > 1) {
		let t = c + (C ? 0 : d), n = ~~(b / t);
		e._currentIteration = Ps(n, 0, l), C && e._currentIteration--, E = e._currentIteration % 2, ee = b - n * t || 0;
	}
	let ne = f ^ (p && E), D = e._ease, O = C ? ne ? 0 : o : ne ? c - ee : ee;
	D && (O = c * D(O / c) || 0);
	let re = (a ? a.backwards : v < g) ? !ne : !!ne;
	if (e._currentTime = v, e._iterationTime = O, e.backwards = re, S && !e.began ? (e.began = !0, !n && !(a && (re || !a.began)) && e.onBegin(e)) : v <= 0 && (e.began = !1), !n && !m && S && e._currentIteration !== u && e.onLoop(e), T || i === Fo.AUTO && (t >= (a && h > 0 ? 0 : h) && t <= _ || t <= h && y > h || t >= _ && y !== o) || O >= _ && y !== o || O <= h && y > 0 && !C || t <= y && y === o && s || C && !s && w) {
		if (S && (e.computeDeltaTime(y), n || e.onBeforeUpdate(e)), !m) {
			let t = T || (re ? x * -1 : x) >= G.tickThreshold, i = q(e._offset + (a ? a._offset : 0) + h + O, 12), o = e._head, s, c, l, u, d = 0;
			for (; o;) {
				let e = o._composition, n = o._currentTime, a = o._changeDuration, f = o._absoluteStartTime + o._changeDuration, p = o._nextRep, m = o._prevRep, h = e !== U.none, g = m ? m._absoluteStartTime + m._changeDuration : 0, _ = m && m.parent !== o.parent, v = !p || p._isOverridden ? f : p.parent === o.parent ? f + p._delay : p._absoluteStartTime < p._absoluteUpdateStartTime ? p._absoluteStartTime : p._absoluteUpdateStartTime;
				if ((t || (n !== a || i <= v || m && !_ && (!p || p.parent !== o.parent)) && (n !== 0 || i >= o._absoluteStartTime || _ && !o._hasFromValue && !m._isOverridden && i >= g || p && !p._isOverridden && p.parent === o.parent && p._currentTime !== 0 && O < p._startTime)) && (!m || _ || O >= o._startTime) && (!h || !o._isOverridden && (!o._isOverlapped || i <= f) && (!p || p._isOverridden || i <= v) && (!m || m._isOverridden || (_ ? i >= o._absoluteStartTime || !o._hasFromValue && i >= g : i >= g + o._delay)))) {
					let t = o._currentTime = Ps(O - o._startTime, 0, a), n = o._ease(t / o._updateDuration), i = o._modifier, f = o._valueType, p = o._tweenType, m = p === V.OBJECT, g = f === H.NUMBER, _ = g && m || n === 0 || n === 1 ? -1 : G.precision, v, y;
					if (g) v = y = i(q(Fs(o._fromNumber, o._toNumber, n), _));
					else if (f === H.UNIT) y = i(q(Fs(o._fromNumber, o._toNumber, n), _)), v = `${y}${o._unit}`;
					else if (f === H.COLOR) {
						let e = o._numbers, t = o._fromNumbers, a = o._toNumbers, s = 1 - n, c = t[0], l = t[1], u = t[2], d = a[0], f = a[1], p = a[2];
						e[0] = i(Math.sqrt(c * c * s + d * d * n)), e[1] = i(Math.sqrt(l * l * s + f * f * n)), e[2] = i(Math.sqrt(u * u * s + p * p * n)), e[3] = i(Fs(t[3], a[3], n)), (!o._setter || r) && (v = `rgba(${q(e[0], 0)},${q(e[1], 0)},${q(e[2], 0)},${e[3]})`);
					} else f === H.COMPLEX && (v = oc(o, n, _));
					if (h && (o._number = y), !r && e !== U.blend) {
						let e = o.property;
						s = o.target, o._setter ? o._setter(s, y, o) : m ? s[e] = v : p === V.ATTRIBUTE ? s.setAttribute(e, v) : (c = s.style, p === V.TRANSFORM ? (s !== l && (l = s, u = s[zo]), u[e] = v, d = 1) : p === V.CSS ? c[e] = v : p === V.CSS_VAR && c.setProperty(e, v)), S && (te = 1);
					} else o._value = v;
				} else n && m && !_ && O < o._startTime && (o._currentTime = 0);
				d && o._renderTransforms && (c.transform = Hs(u), d = 0), o = o._next;
			}
			!n && te && e.onRender(e);
		}
		!n && S && e.onUpdate(e);
	}
	return a && w ? !n && (a.began && !re && v > 0 && !s || re && v <= 1e-11 && s) && (e.onComplete(e), e.completed = !re) : S && C ? l === Infinity ? e._startTime += e.duration : e._currentIteration >= l - 1 && (e.paused = !0, !s && !m && (e.completed = !0, !n && !(a && (re || !a.began)) && (e.onComplete(e), e._resolve(e)))) : e.completed = !1, te;
}, cc = (e, t, n, r, i) => {
	let a = e._currentIteration;
	if (sc(e, t, n, r, i), e._hasChildren) {
		let o = e, s = o.backwards, c = r ? t : o._iterationTime, l = ds(), u = 0, d = !0;
		if (!r && o._currentIteration !== a) {
			let e = o.iterationDuration;
			Y(o, (t) => {
				if (!s) !t.completed && !t.backwards && t._currentTime < t.iterationDuration && sc(t, e, n, 1, Fo.FORCE), t.began = !1, t.completed = !1;
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
			u += sc(e, t, n, r, a), !e.completed && d && (d = !1);
		}, s), !n && u && o.onRender(o), (d || s) && o._currentTime >= o.duration && (o.paused = !0, o.completed || (o.completed = !0, n || (o.onComplete(o), o._resolve(o))));
	}
}, lc = {}, uc = (e, t, n) => {
	if (n === V.TRANSFORM) return Wo.get(e) || e;
	if (n === V.CSS || n === V.ATTRIBUTE && vs(t) && e in t.style) {
		let t = lc[e];
		if (t) return t;
		{
			let t = e && ls(e);
			return lc[e] = t, t;
		}
	} else return e;
}, dc = (e, t = !1) => {
	if (e._hasChildren) Y(e, (e) => dc(e, t), !0);
	else {
		let n = e;
		n.pause(), Y(n, (e) => {
			let r = e.property, i = e.target, a = e._tweenType, o = e._inlineValue, s = _s(o) || o === "";
			if (e._setter) {
				if (!t && !s) {
					if (rc(o, ac), ac.d) {
						let t = ac.d, n = e._numbers;
						for (let e = 0, r = t.length; e < r; e++) n[e] = t[e];
					} else e._number = ac.n;
					e._setter(e.target, e._number, e);
				}
			} else if (a === V.OBJECT) !t && !s && (i[r] = o);
			else if (i[Lo]) if (a === V.ATTRIBUTE) t || (s ? i.removeAttribute(r) : i.setAttribute(r, o));
			else {
				let t = i.style;
				if (a === V.TRANSFORM) {
					let n = i[zo];
					s ? delete n[r] : n[r] = o, e._renderTransforms && (Object.keys(n).length ? t.transform = Hs(n) : t.removeProperty("transform"));
				} else s ? t.removeProperty(ls(r)) : t[r] = o;
			}
			i[Lo] && n._tail === e && n.targets.forEach((e) => {
				e.getAttribute && e.getAttribute("style") === "" && e.removeAttribute("style");
			});
		});
	}
	return e;
}, fc = class {
	constructor(e = 0) {
		this.deltaTime = 0, this._currentTime = e, this._lastTickTime = e, this._startTime = e, this._lastTime = e, this._frameDuration = Ho / 240, this._fps = 240, this._speed = 1, this._hasChildren = !1, this._head = null, this._tail = null;
	}
	get fps() {
		return this._fps;
	}
	set fps(e) {
		let t = +e, n = t < 1e-11 ? W : t, r = Ho / n;
		n > os.frameRate && (os.frameRate = n), this._fps = n, this._frameDuration = r;
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
		return n + (r < 4 ? r : 4) < t ? Fo.NONE : (this._lastTickTime = n >= t ? e - n % t : e, Fo.AUTO);
	}
	computeDeltaTime(e) {
		let t = e - this._lastTime;
		return this.deltaTime = t, this._lastTime = e, t;
	}
}, pc = {
	animation: null,
	update: qo
}, mc = (e) => {
	let t = pc.animation;
	return t || (t = {
		duration: W,
		computeDeltaTime: qo,
		_offset: 0,
		_delay: 0,
		_head: null,
		_tail: null
	}, pc.animation = t, pc.update = () => {
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
		}), sc(t, 1, 1, 0, Fo.FORCE);
	}), t;
}, hc = Mo ? requestAnimationFrame : setImmediate, gc = Mo ? cancelAnimationFrame : clearImmediate, _c = class extends fc {
	constructor(e) {
		super(e), this.useDefaultMainLoop = !0, this.pauseOnDocumentHidden = !0, this.defaults = os, this.paused = !0, this.reqId = 0;
	}
	update() {
		let e = this._currentTime = ds();
		if (this.requestTick(e)) {
			this.computeDeltaTime(e);
			let t = this._speed, n = this._fps, r = this._head;
			for (; r;) {
				let i = r._next;
				r.paused ? (zs(this, r), this._hasChildren = !!this._tail, r._running = !1, r.completed && !r._cancelled && r.cancel()) : cc(r, (e - r._startTime) * r._speed * t, 0, 0, r._fps < n ? r.requestTick(e) : Fo.AUTO), r = i;
			}
			pc.update();
		}
	}
	wake() {
		return this.useDefaultMainLoop && !this.reqId && (this.requestTick(ds()), this.reqId = hc(vc)), this;
	}
	pause() {
		if (this.reqId) return this.paused = !0, yc();
	}
	resume() {
		if (this.paused) return this.paused = !1, Y(this, (e) => e.resetTime()), this.wake();
	}
	get speed() {
		return this._speed * (G.timeScale === 1 ? 1 : Ho);
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
			let e = n ? t : Ho;
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
	let e = new _c(ds());
	return Mo && (cs.engine = e, Po.addEventListener("visibilitychange", () => {
		e.pauseOnDocumentHidden && (Po.hidden ? e.pause() : e.resume());
	})), e;
})(), vc = () => {
	Z._head ? (Z.reqId = hc(vc), Z.update()) : Z.reqId = 0;
}, yc = () => (gc(Z.reqId), Z.reqId = 0, Z), bc = {
	_rep: /* @__PURE__ */ new WeakMap(),
	_add: /* @__PURE__ */ new Map()
}, xc = (e, t, n = "_rep") => {
	let r = bc[n], i = r.get(e);
	return i || (i = {}, r.set(e, i)), i[t] ? i[t] : i[t] = {
		_head: null,
		_tail: null
	};
}, Sc = (e, t) => e._isOverridden || e._absoluteStartTime > t._absoluteStartTime, Cc = (e) => {
	e._isOverlapped = 1, e._isOverridden = 1, e._changeDuration = W, e._currentTime = W;
}, wc = (e, t) => {
	let n = e._composition;
	if (n === U.replace) {
		let n = e._absoluteStartTime;
		Bs(t, e, Sc, "_prevRep", "_nextRep");
		let r = e._prevRep;
		if (r) {
			let t = r.parent, i = r._absoluteEndTime;
			if (e.parent.id !== t.id && t.iterationCount > 1 && i + (t.duration - t.iterationDuration) > n) {
				Cc(r);
				let e = r._prevRep;
				for (; e && e.parent.id === t.id;) Cc(e), e = e._prevRep;
			}
			let a = e._absoluteUpdateStartTime;
			if (i > a) {
				let e = r._startTime, t = q(a - (i - (e + r._updateDuration)) - e, 12);
				r._changeDuration = t, r._currentTime = t, r._isOverlapped = 1, t < 1e-11 && Cc(r);
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
		let t = xc(e.target, e.property, "_add"), n = mc(bc._add), r = t._head;
		r || (r = { ...e }, r._composition = U.replace, r._updateDuration = W, r._startTime = 0, r._numbers = J(e._fromNumbers), r._number = 0, r._next = null, r._prev = null, Bs(t, r), Bs(n, r));
		let i = e._toNumber;
		if (e._fromNumber = r._fromNumber - i, e._toNumber = 0, e._numbers = J(e._fromNumbers), e._number = 0, r._fromNumber = i, e._toNumbers.length) {
			let t = J(e._toNumbers);
			t.forEach((t, n) => {
				e._fromNumbers[n] = r._fromNumbers[n] - t, e._toNumbers[n] = 0;
			}), r._fromNumbers = t;
		}
		Bs(t, e, null, "_prevAdd", "_nextAdd");
	}
	return e;
}, Tc = (e) => {
	let t = e._composition;
	if (t !== U.none) {
		let n = e.target, r = e.property, i = bc._rep.get(n)[r];
		if (zs(i, e, "_prevRep", "_nextRep"), t === U.blend) {
			let t = bc._add, i = t.get(n);
			if (!i) return;
			let a = i[r], o = pc.animation;
			zs(a, e, "_prevAdd", "_nextAdd");
			let s = a._head;
			if (s && s === a._tail) {
				zs(a, s, "_prevAdd", "_nextAdd"), zs(o, s);
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
}, Ec = (e, t, n) => {
	let r = !1;
	return Y(t, (i) => {
		let a = i.target;
		if (e.includes(a)) {
			let e = i.property, o = i._tweenType, s = uc(n, a, o);
			(!s || s && s === e) && (i.parent._tail === i && i._tweenType === V.TRANSFORM && i._prev && i._prev._tweenType === V.TRANSFORM && (i._prev._renderTransforms = 1), zs(t, i), Tc(i), r = !0);
		}
	}, !0), r;
}, Dc = (e, t, n) => {
	let r = t || Z, i;
	if (r._hasChildren) {
		let t = 0;
		Y(r, (a) => {
			if (!a._hasChildren) if (i = Ec(e, a, n), i && !a._head) a.cancel(), zs(r, a);
			else {
				let e = a._offset + a._delay + a.duration;
				e > t && (t = e);
			}
			a._head ? Dc(e, a, n) : a._hasChildren = !1;
		}, !0), K(r.iterationDuration) || (r.iterationDuration = t);
	} else i = Ec(e, r, n);
	i && !r._head && (r._hasChildren = !1, r.cancel && r.cancel());
}, Oc = (e) => (e.paused = !0, e.began = !1, e.completed = !1, e), kc = (e) => e._cancelled ? (e._hasChildren ? Y(e, kc) : Y(e, (e) => {
	e._composition !== U.none && wc(e, xc(e.target, e.property));
}), e._cancelled = 0, e) : e, Ac = 0, jc = (e, t) => e._priority > t._priority, Mc = class extends fc {
	constructor(e = {}, t = null, n = 0) {
		super(0), ++Ac;
		let { id: r, delay: i, duration: a, reversed: o, alternate: s, loop: c, loopDelay: l, autoplay: u, frameRate: d, playbackRate: f, priority: p, onComplete: m, onLoop: h, onPause: g, onBegin: _, onBeforeUpdate: v, onUpdate: y } = e;
		ss.current && ss.current.register(this);
		let b = t ? 0 : Z._lastTickTime, x = t ? t.defaults : G.defaults, S = gs(i) || K(i) ? x.delay : +i, C = gs(a) || K(a) ? Infinity : +a, w = X(c, x.loop), T = X(l, x.loopDelay), E = w === !0 || w === Infinity || w < 0 ? Infinity : w + 1, ee = 0;
		t ? ee = n : (Z.reqId || Z.requestTick(ds()), ee = (Z._lastTickTime - Z._startTime) * G.timeScale), this.id = K(r) ? Ac : r, this.parent = t, this.duration = Is((C + T) * E - T) || 1e-11, this.backwards = !1, this.paused = !0, this.began = !1, this.completed = !1, this.onBegin = _ || x.onBegin, this.onBeforeUpdate = v || x.onBeforeUpdate, this.onUpdate = y || x.onUpdate, this.onLoop = h || x.onLoop, this.onPause = g || x.onPause, this.onComplete = m || x.onComplete, this.iterationDuration = C, this.iterationCount = E, this._autoplay = !t && X(u, x.autoplay), this._offset = ee, this._delay = S, this._loopDelay = T, this._iterationTime = 0, this._currentIteration = 0, this._resolve = qo, this._running = !1, this._reversed = +X(o, x.reversed), this._reverse = this._reversed, this._cancelled = 0, this._alternate = X(s, x.alternate), this._prev = null, this._next = null, this._lastTickTime = b, this._startTime = b, this._lastTime = b, this._fps = X(d, x.frameRate), this._speed = X(f, x.playbackRate), this._priority = +X(p, 1);
	}
	get cancelled() {
		return !!this._cancelled;
	}
	set cancelled(e) {
		e ? this.cancel() : this.reset(!0).play();
	}
	get currentTime() {
		return Ps(q(this._currentTime, G.precision), -this._delay, this.duration);
	}
	set currentTime(e) {
		let t = this.paused;
		this.pause().seek(+e), t || this.resume();
	}
	get iterationCurrentTime() {
		return Ps(q(this._iterationTime, G.precision), 0, this.iterationDuration);
	}
	set iterationCurrentTime(e) {
		this.currentTime = this.iterationDuration * this._currentIteration + e;
	}
	get progress() {
		return Ps(q(this._currentTime / this.duration, 10), 0, 1);
	}
	set progress(e) {
		this.currentTime = this.duration * e;
	}
	get iterationProgress() {
		return Ps(q(this._iterationTime / this.iterationDuration, 10), 0, 1);
	}
	set iterationProgress(e) {
		let t = this.iterationDuration;
		this.currentTime = t * this._currentIteration + t * e;
	}
	get currentIteration() {
		return this._currentIteration;
	}
	set currentIteration(e) {
		this.currentTime = this.iterationDuration * Ps(+e, 0, this.iterationCount - 1);
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
		return kc(this), this._reversed && !this._reverse && (this.reversed = !1), this._iterationTime = this.iterationDuration, cc(this, 0, 1, ~~e, Fo.FORCE), Oc(this), this._hasChildren && Y(this, Oc), this;
	}
	init(e = !1) {
		this.fps = this._fps, this.speed = this._speed, !e && this._hasChildren && cc(this, this.duration, 1, ~~e, Fo.FORCE), this.reset(e);
		let t = this._autoplay;
		return t === !0 ? this.resume() : t && !K(t.linked) && t.link(this), this;
	}
	resetTime() {
		let e = 1 / (this._speed * Z._speed);
		return this._startTime = ds() - (this._currentTime + this._delay) * e, this;
	}
	pause() {
		return this.paused ? this : (this.paused = !0, this.onPause(this), this);
	}
	resume() {
		return this.paused ? (this.paused = !1, this.duration <= 1e-11 && !this._hasChildren ? cc(this, W, 0, 0, Fo.FORCE) : (this._running ||= (Bs(Z, this, jc), Z._hasChildren = !0, !0), this.resetTime(), this._startTime -= 12, Z.wake()), this) : this;
	}
	restart() {
		return this.reset().resume();
	}
	seek(e, t = 0, n = 0) {
		kc(this), this.completed = !1;
		let r = this.paused;
		return this.paused = !0, cc(this, e + this._delay, ~~t, ~~n, Fo.AUTO), r ? this : this.resume();
	}
	alternate() {
		let e = this._reversed, t = this.iterationCount, n = this.iterationDuration, r = t === Infinity ? As(Vo / n) : t;
		return this._reversed = +(this._alternate && !(r % 2) ? e : !e), t === Infinity ? this.iterationProgress = this._reversed ? 1 - this.iterationProgress : this.iterationProgress : this.seek(n * r - this._currentTime), this.resetTime(), this;
	}
	play() {
		return this._reversed && this.alternate(), this.resume();
	}
	reverse() {
		return this._reversed || this.alternate(), this.resume();
	}
	cancel() {
		return this._hasChildren ? Y(this, (e) => e.cancel(), !0) : Y(this, Tc), this._cancelled = 1, this.pause();
	}
	stretch(e) {
		let t = this.duration, n = Ls(e);
		if (t === n) return this;
		let r = e / t, i = e <= W;
		return this.duration = i ? W : n, this.iterationDuration = i ? W : Ls(this.iterationDuration * r), this._offset *= r, this._delay *= r, this._loopDelay *= r, this;
	}
	revert() {
		cc(this, 0, 1, 0, Fo.AUTO);
		let e = this._autoplay;
		return e && e.linked && e.linked === this && e.revert(), this.cancel();
	}
	complete(e = 0) {
		return this.seek(this.duration, e).cancel();
	}
	then(e = qo) {
		let t = this.then, n = () => {
			this.then = null, e(this), this.then = t, this._resolve = qo;
		};
		return new Promise((e) => (this._resolve = () => e(n()), this.completed && this._resolve(), this));
	}
};
//#endregion
//#region node_modules/.pnpm/animejs@4.5.0/node_modules/animejs/dist/modules/core/targets.js
function Nc(e) {
	let t = hs(e) ? ss.root.querySelectorAll(e) : e;
	if (t instanceof NodeList || t instanceof HTMLCollection) return t;
}
function Pc(e) {
	if (_s(e)) return [];
	if (!Mo) return fs(e) && e.flat(Infinity) || [e];
	if (fs(e)) {
		let t = e.flat(Infinity), n = [];
		for (let e = 0, r = t.length; e < r; e++) {
			let r = t[e];
			if (!_s(r)) {
				let e = Nc(r);
				if (e) for (let t = 0, r = e.length; t < r; t++) {
					let r = e[t];
					if (!_s(r)) {
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
	let t = Nc(e);
	return t ? Array.from(t) : [e];
}
function Fc(e) {
	let t = Pc(e), n = t.length;
	for (let e = 0; e < n; e++) {
		let n = t[e];
		if (!n[Io]) {
			n[Io] = !0;
			let e = vs(n);
			(n.nodeType || e) && (n[Lo] = !0, n[Ro] = e, n[zo] = {});
		}
	}
	return t;
}
//#endregion
//#region node_modules/.pnpm/animejs@4.5.0/node_modules/animejs/dist/modules/core/units.js
var Ic = {
	deg: 1,
	rad: 180 / Ms,
	turn: 360
}, Lc = {}, Rc = (e, t, n, r = !1) => {
	let i = t.u, a = t.n;
	if (t.t === H.UNIT && i === n) return t;
	let o = a + i + n, s = Lc[o];
	if (!K(s) && !r) t.n = s;
	else {
		let r;
		if (i in Ic) r = a * Ic[i] / Ic[n];
		else {
			let t = e.cloneNode(), o = e.parentNode, s = o && o !== Po ? o : Po.body;
			s.appendChild(t);
			let c = t.style;
			c.width = 100 + i;
			let l = t.offsetWidth || 100;
			c.width = 100 + n;
			let u = l / (t.offsetWidth || 100);
			s.removeChild(t), r = u * a;
		}
		t.n = r, Lc[o] = r;
	}
	return t.t, H.UNIT, t.u = n, t;
}, zc = (e) => e, Bc = (e = 1.68) => (t) => Es(t, +e), Vc = {
	in: (e) => (t) => e(t),
	out: (e) => (t) => 1 - e(1 - t),
	inOut: (e) => (t) => t < .5 ? e(t * 2) / 2 : 1 - e(t * -2 + 2) / 2,
	outIn: (e) => (t) => t < .5 ? (1 - e(1 - t * 2)) / 2 : (e(t * 2 - 1) + 1) / 2
}, Hc = Ms / 2, Uc = Ms * 2, Wc = {
	"": Bc,
	Quad: Bc(2),
	Cubic: Bc(3),
	Quart: Bc(4),
	Quint: Bc(5),
	Sine: (e) => 1 - ks(e * Hc),
	Circ: (e) => 1 - Ds(1 - e * e),
	Expo: (e) => e ? Es(2, 10 * e - 10) : 0,
	Bounce: (e) => {
		let t, n = 4;
		for (; e < ((t = Es(2, --n)) - 1) / 11;);
		return 1 / Es(4, 3 - n) - 7.5625 * Es((t * 3 - 2) / 22 - e, 2);
	},
	Back: (e = 1.7) => (t) => (+e + 1) * t * t * t - +e * t * t,
	Elastic: (e = 1, t = .3) => {
		let n = Ps(+e, 1, 10), r = Ps(+t, W, 2), i = r / Uc * js(1 / n), a = Uc / r;
		return (e) => e === 0 || e === 1 ? e : -n * Es(2, -10 * (1 - e)) * Os((1 - e - i) * a);
	}
}, Gc = /*#__PURE__ */ (() => {
	let e = {
		linear: zc,
		none: zc
	};
	for (let t in Vc) for (let n in Wc) {
		let r = Wc[n], i = Vc[t];
		e[t + n] = n === "" || n === "Back" || n === "Elastic" ? (e, t) => i(r(e, t)) : i(r);
	}
	return e;
})(), Kc = {
	linear: zc,
	none: zc
}, qc = (e) => {
	if (Kc[e]) return Kc[e];
	if (e.indexOf("(") <= -1) {
		let t = Vc[e] || e.includes("Back") || e.includes("Elastic") ? Gc[e]() : Gc[e];
		return t ? Kc[e] = t : zc;
	} else {
		let t = e.slice(0, -1).split("("), n = Gc[t[0]];
		return n ? Kc[e] = n(...t[1].split(",")) : zc;
	}
}, Jc = [
	"steps(",
	"irregular(",
	"linear(",
	"cubicBezier("
], Yc = (e) => {
	if (hs(e)) {
		for (let t = 0, n = Jc.length; t < n; t++) if (us(e, Jc[t])) return console.warn(`String syntax for \`ease: "${e}"\` has been removed from the core and replaced by importing and passing the easing function directly: \`ease: ${e}\``), zc;
	}
	return gs(e) ? e : hs(e) ? qc(e) : zc;
}, Q = nc(), $ = nc(), Xc = {}, Zc = { func: null }, Qc = { func: null }, $c = [null], el = [null, null], tl = { to: null }, nl = 0, rl = 0, il, al, ol = (e, t) => {
	let n = {};
	if (fs(e)) {
		let t = [].concat(...e.map((e) => Object.keys(e))).filter(Cs);
		for (let r = 0, i = t.length; r < i; r++) {
			let i = t[r];
			n[i] = e.map((e) => {
				let t = {};
				for (let n in e) {
					let r = e[n];
					Cs(n) ? n === i && (t.to = r) : t[n] = r;
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
			for (let e in i) if (Cs(e)) {
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
}, sl = class extends Mc {
	constructor(e, t, n, r, i = !1, a = 0, o) {
		super(t, n, r), this._head, this._tail, ++rl;
		let s = Fc(e), c = s.length, l = t.keyframes, u = l ? Rs(ol(l, t), t) : t, { id: d, delay: f, duration: p, ease: m, playbackEase: h, modifier: g, composition: _, onRender: v } = u, y = n ? n.defaults : G.defaults, b = X(m, y.ease), x = X(h, y.playbackEase), S = x ? Yc(x) : null, C = !K(b.ease), w = C ? b.ease : X(m, S ? "linear" : y.ease), T = C ? b.settlingDuration : X(p, y.duration), E = X(f, y.delay), ee = g || y.modifier, te = K(_) && c >= 1e3 ? U.none : K(_) ? y.composition : _, ne = this._offset + (n ? n._offset : 0);
		C && (b.parent = this);
		let D = NaN, O = NaN, re = 0, ie = 0;
		for (let e = 0; e < c; e++) {
			let t = s[e], r = a || e, c = o || s, l = NaN, d = NaN;
			for (let e in u) if (Cs(e)) {
				let a = Qs(t, e), o = Ws(t, e), s = uc(e, t, a), f = u[e], p = fs(f);
				if (i && !p && (el[0] = f, el[1] = f, f = el), p) {
					let e = f.length, t = !ps(f[0]);
					e === 2 && t ? (tl.to = f, $c[0] = tl, il = $c) : e > 2 && t ? (il = [], f.forEach((e, t) => {
						t ? t === 1 ? (el[1] = e, il.push(el)) : il.push(e) : el[0] = e;
					})) : il = f;
				} else $c[0] = f, il = $c;
				let m = null, h = null, g = NaN, _ = 0, v = 0;
				for (let e = il.length; v < e; v++) {
					let i = il[v];
					ps(i) ? al = i : (tl.to = i, al = tl), Zc.func = null, Qc.func = null;
					let l = Zs(X(al.composition, te), t, r, c, null, null), u = ms(l) ? l : U[l];
					!m && u !== U.none && (m = xc(t, s));
					let d = m ? m._tail : null, f = n && d && d.parent.parent === n ? d : h, p = Zs(al.to, t, r, c, Zc, f), y;
					ps(p) && !K(p.to) ? (al = p, y = p.to) : y = p;
					let b = Zs(al.from, t, r, c, Qc, f), x = al.ease || w, S = Zs(x, t, r, c, null, f), C = gs(S) || hs(S) ? S : x, D = !K(C) && !K(C.ease), O = D ? C.ease : C, ae = D ? C.settlingDuration : Zs(X(al.duration, e > 1 ? Zs(T, t, r, c, null, f) / e : T), t, r, c, null, f), oe = Zs(X(al.delay, v ? 0 : E), t, r, c, null, f), se = al.modifier || ee, ce = !K(b), le = !K(y), ue = fs(y), de = ue || ce && le, fe = h ? _ : 0, pe = h ? _ + oe : oe, me = q(ne + pe, 12), he = q(ne + fe, 12);
					!ie && (ce || ue) && (ie = 1);
					let k = h;
					if (u !== U.none) {
						let e = m._head;
						for (; e && e._absoluteStartTime <= me;) if (e._isOverridden || (k = e), e = e._nextRep, e && e._absoluteStartTime >= me) for (; e;) Cc(e), e = e._nextRep;
					}
					if (de) {
						rc(ue ? Zs(y[0], t, r, c, Qc, f) : b, Q), rc(ue ? Zs(y[1], t, r, c, Zc, f) : y, $);
						let e = ec(t, s, a, Xc);
						Q.t === H.NUMBER && (k ? k._valueType === H.UNIT && (Q.t = H.UNIT, Q.u = k._unit) : (rc(e, ac), ac.t === H.UNIT && (Q.t = H.UNIT, Q.u = ac.u)));
					} else le ? rc(y, $) : h ? ic(h, $) : rc(n && k && k.parent.parent === n ? k._value : ec(t, s, a, Xc), $), ce ? rc(b, Q) : h ? ic(h, Q) : rc(n && k && k.parent.parent === n ? k._value : ec(t, s, a, Xc), Q);
					if (Q.o && (Q.n = tc(k ? k._toNumber : rc(ec(t, s, a, Xc), ac).n, Q.n, Q.o)), $.o && ($.n = tc(Q.n, $.n, $.o)), Q.t !== $.t) {
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
						e = Rc(t, e, $.u ? $.u : Q.u, !1);
					}
					if ($.d && Q.d && $.d.length !== Q.d.length) {
						let e = Q.d.length > $.d.length ? Q : $, t = e === Q ? $ : Q;
						t.d = e.d.map((e, n) => K(t.d[n]) ? 0 : t.d[n]), t.s = J(e.s);
					}
					let ge = q(+ae || 1e-11, 12), _e = Xc[s];
					_s(_e) || (Xc[s] = null);
					let ve = o ? o.set : null;
					_ = q(pe + ge, 12);
					let ye = Q.d, be = $.d, xe = $.s, A = {
						parent: this,
						id: nl++,
						property: s,
						target: t,
						_value: null,
						_toFunc: Zc.func,
						_fromFunc: Qc.func,
						_ease: Yc(O),
						_fromNumbers: ye ? J(ye) : Uo,
						_toNumbers: be ? J(be) : Uo,
						_strings: xe ? J(xe) : Uo,
						_fromNumber: Q.n,
						_toNumber: $.n,
						_numbers: ye ? J(ye) : Uo,
						_number: Q.n,
						_unit: $.u,
						_modifier: se,
						_currentTime: 0,
						_startTime: pe,
						_delay: +oe,
						_updateDuration: ge,
						_changeDuration: ge,
						_absoluteStartTime: me,
						_absoluteUpdateStartTime: he,
						_absoluteEndTime: q(ne + _, 12),
						_hasFromValue: ce || ue ? 1 : 0,
						_tweenType: a,
						_setter: ve,
						_valueType: $.t,
						_composition: u,
						_isOverlapped: 0,
						_isOverridden: 0,
						_renderTransforms: 0,
						_inlineValue: _e,
						_prevRep: null,
						_nextRep: null,
						_prevAdd: null,
						_nextAdd: null,
						_prev: null,
						_next: null
					};
					u !== U.none && wc(A, m);
					let Se = A._valueType;
					if (Se === H.COMPLEX) A._value = oc(A, 1, -1);
					else if (Se === H.UNIT) A._value = `${se(A._toNumber)}${A._unit}`;
					else if (Se === H.COLOR) {
						let e = $.d;
						A._value = `rgba(${q(e[0], 0)},${q(e[1], 0)},${q(e[2], 0)},${e[3]})`;
					} else A._value = se(A._toNumber);
					isNaN(g) && (g = A._startTime), h = A, re++, Bs(this, A);
				}
				(isNaN(O) || g < O) && (O = g), (isNaN(D) || _ > D) && (D = _), a === V.TRANSFORM && (l = re - v, d = re);
			}
			if (!isNaN(l)) {
				let e = 0;
				Y(this, (t) => {
					e >= l && e < d && (t._renderTransforms = 1, t._composition === U.blend && Y(pc.animation, (e) => {
						e.id === t.id && (e._renderTransforms = 1);
					})), e++;
				});
			}
		}
		c || console.warn("No target found. Make sure the element you're trying to animate is accessible before creating your animation."), O ? (Y(this, (e) => {
			e._startTime - e._delay || (e._delay -= O), e._startTime -= O;
		}), D -= O) : O = 0, D || (D = W, this.iterationCount = 0), this.targets = s, this.id = K(d) ? rl : d, this.duration = D === 1e-11 ? W : Is((D + this._loopDelay) * this.iterationCount - this._loopDelay) || 1e-11, this.onRender = v || y.onRender, this._ease = S, this._delay = O, this.iterationDuration = D, !this._autoplay && ie && this.onRender(this);
	}
	stretch(e) {
		let t = this.duration;
		if (t === Ls(e)) return this;
		let n = e / t;
		return Y(this, (e) => {
			e._updateDuration = Ls(e._updateDuration * n), e._changeDuration = Ls(e._changeDuration * n), e._currentTime *= n, e._delay *= n, e._startTime *= n, e._absoluteStartTime *= n, e._absoluteUpdateStartTime *= n, e._absoluteEndTime *= n;
		}), super.stretch(e);
	}
	refresh() {
		return Y(this, (e) => {
			let t = e._toFunc, n = e._fromFunc;
			(t || n) && (n ? (rc(n(), Q), Q.u !== e._unit && e.target[Lo] && Rc(e.target, Q, e._unit, !0), e._fromNumbers = J(Q.d), e._fromNumber = Q.n) : t && (rc(ec(e.target, e.property, e._tweenType), ac), e._fromNumbers = J(ac.d), e._fromNumber = ac.n), t && (rc(t(), $), e._toNumbers = J($.d), e._strings = J($.s), e._toNumber = $.o ? tc(e._fromNumber, $.n, $.o) : $.n));
		}), this.duration === 1e-11 && this.restart(), this;
	}
	revert() {
		return super.revert(), dc(this);
	}
	then(e) {
		return super.then(e);
	}
}, cl = (e, t) => {
	if (us(t, "<")) {
		let n = t[1] === "<", r = e._tail, i = r ? r._offset + r._delay : 0;
		return n ? i : i + r.duration;
	}
}, ll = (e, t) => {
	let n = e.iterationDuration;
	if (n === 1e-11 && (n = 0), K(t)) return n;
	if (ms(+t)) return +t;
	let r = t, i = e ? e.labels : null, a = !_s(i), o = cl(e, r), s = !K(o), c = is.exec(r);
	if (c) {
		let e = c[0], t = r.split(e), l = a && t[0] ? i[t[0]] : n;
		return tc(s ? o : a ? l : n, +t[1], e[0]);
	} else return s ? o : a ? K(i[r]) ? n : i[r] : n;
};
//#endregion
//#region node_modules/.pnpm/animejs@4.5.0/node_modules/animejs/dist/modules/timeline/timeline.js
function ul(e) {
	return Is((e.iterationDuration + e._loopDelay) * e.iterationCount - e._loopDelay) || 1e-11;
}
function dl(e, t, n, r, i, a) {
	let o = ms(e.duration) && e.duration <= 1e-11 ? n - W : n;
	t.composition && cc(t, o, 1, 1, Fo.AUTO);
	let s = r ? new sl(r, e, t, o, !1, i, a) : new Mc(e, t, o);
	return t.composition && s.init(!0), Bs(t, s), Y(t, (e) => {
		let n = e._offset + e._delay + e.duration;
		n > t.iterationDuration && (t.iterationDuration = n);
	}), t.duration = ul(t), t;
}
var fl = 0, pl = class extends Mc {
	constructor(e = {}) {
		super(e, null, 0), ++fl, this.id = K(e.id) ? fl : e.id, this.duration = 0, this.labels = {};
		let t = e.defaults, n = G.defaults;
		this.defaults = t ? Rs(t, n) : n, this.composition = X(e.composition, !0), this.onRender = e.onRender || n.onRender;
		let r = X(e.playbackEase, n.playbackEase);
		this._ease = r ? Yc(r) : null, this.iterationDuration = 0;
	}
	add(e, t, n) {
		let r = ps(t), i = ps(e);
		if (r || i) {
			if (this._hasChildren = !0, r) {
				let r = t, i = G.editor && G.editor.addTimelineChild, a = n && n.type === "Stagger" && G.editor, o = gs(n) ? n : null;
				if (o || a) {
					let t = Pc(e), a = this.duration, s = this.iterationDuration, c = r.id, l = 0, u = t.length, d = i ? i(e, r, this.id, n, u) : null, f = o || G.editor.resolveStagger(n.defaultValue);
					t.forEach((e) => {
						let n = { ...d || r };
						this.duration = a, this.iterationDuration = s, K(c) || (n.id = c + "-" + l);
						let i = ll(this, f(e, l, t, null, this));
						dl(n, this, i, e, l, t), l++;
					});
				} else {
					let t = i ? i(e, r, this.id, n) : r, a = n && n.type ? n.defaultValue : n;
					dl(t, this, ll(this, a), e);
				}
			} else dl(e, this, ll(this, t));
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
		return K(e) || e && !gs(e) ? this : (G.editor && G.editor.addTimelineCall && (t = G.editor.addTimelineCall(e, t, this.id)), this.add({
			duration: 0,
			delay: 0,
			onComplete: () => e(this)
		}, t));
	}
	label(e, t) {
		return K(e) || e && !hs(e) ? this : (G.editor && G.editor.addTimelineLabel && (t = G.editor.addTimelineLabel(e, t, this.id)), this.labels[e] = ll(this, t), this);
	}
	remove(e, t) {
		return Dc(Pc(e), this, t), this;
	}
	stretch(e) {
		let t = this.duration;
		if (t === Ls(e)) return this;
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
		return super.revert(), Y(this, (e) => e.revert, !0), dc(this);
	}
	then(e) {
		return super.then(e);
	}
}, ml = (e) => G.editor ? G.editor.addTimeline(e) : new pl(e).init();
//#endregion
//#region packages/player/src/timeline.ts
function hl() {
	Z.useDefaultMainLoop = !1;
}
function gl(e, t, n, r) {
	let i = ml({ autoplay: !1 });
	for (let r of e) {
		let e = t.get(r.targetId);
		if (!e) throw Error(`Анимация «${r.id}» ссылается на элемент «${r.targetId}», которого нет на сцене`);
		let a = _o(r.at, n), { property: o, from: s, to: c, duration: l, ease: u } = r.animation;
		i.add(e, {
			[o]: s === void 0 ? c : [s, c],
			duration: l,
			ease: u
		}, a * 1e3);
	}
	let a = r.audioDuration * 1e3;
	if (a > i.duration) {
		let e = t.values().next().value;
		e && i.add(e, {
			opacity: [1, 1],
			duration: a
		}, 0);
	}
	return {
		seekSeconds(e) {
			i.currentTime = e * 1e3;
		},
		get durationSeconds() {
			return i.duration / 1e3;
		}
	};
}
//#endregion
//#region packages/player/src/player.ts
var _l = class {
	#e;
	#t;
	#n;
	#r;
	#i = null;
	#a = null;
	#o = [];
	#s = 0;
	#c = /* @__PURE__ */ new Map();
	#l = "idle";
	#u = null;
	#d = null;
	constructor(e, t, n = {}) {
		this.#e = e, this.#n = t, this.#r = n, this.#t = document.createElement("div"), this.#t.className = "player-stage", this.#t.style.pointerEvents = "none", e.appendChild(this.#t);
	}
	get state() {
		return this.#l;
	}
	get stageElement() {
		return this.#t;
	}
	get positionSeconds() {
		return this.#i?.position ?? 0;
	}
	get currentGate() {
		return this.#l === "at-gate" ? this.#o[this.#s]?.gate : void 0;
	}
	#f(e) {
		this.#l !== e && (this.#l = e, this.#r.onStateChange?.(e));
	}
	async load() {
		this.#f("loading"), hl();
		let e = {
			width: this.#n.meta.stageWidth,
			height: this.#n.meta.stageHeight
		}, t = Ao(this.#t, this.#n.scene, e);
		this.#p(), this.#d = new ResizeObserver(() => this.#p()), this.#d.observe(this.#e);
		let n = new AudioContext(), r = await Co(n, this.#n.audio.src);
		this.#i = new wo(n, r.buffer), this.#a = gl(this.#n.scene.cues, t, this.#n.audio.words, { audioDuration: r.buffer.duration }), this.#o = this.#n.scene.gates.map((e) => ({
			gate: e,
			at: _o(e.at, this.#n.audio.words)
		})).sort((e, t) => e.at - t.at), this.#s = 0, this.#a.seekSeconds(0), this.#f("ready");
	}
	#p() {
		jo(this.#t, this.#e.clientWidth, this.#e.clientHeight, {
			width: this.#n.meta.stageWidth,
			height: this.#n.meta.stageHeight
		});
	}
	async play() {
		let e = this.#x();
		if (this.#l !== "playing") {
			if (this.#l === "at-gate") throw Error("Нельзя продолжить, пока гейт не пройден");
			if (await e.context.resume(), this.#m(0)) {
				this.#_();
				return;
			}
			e.start(this.#l === "ended" ? 0 : e.position), this.#l === "ended" && (this.#s = 0), this.#f("playing"), this.#h();
		}
	}
	#m(e) {
		let t = this.#o[this.#s];
		return t !== void 0 && e >= t.at;
	}
	#h() {
		let e = this.#x(), t = this.#S(), n = () => {
			if (this.#l !== "playing") return;
			let r = e.position;
			if (t.seekSeconds(r), this.#r.onFrame?.(r), this.#m(r)) {
				this.#g();
				return;
			}
			if (r >= e.duration - .02) {
				this.#y();
				return;
			}
			this.#u = requestAnimationFrame(n);
		};
		this.#u = requestAnimationFrame(n);
	}
	async #g() {
		let e = this.#x(), t = this.#S(), n = this.#o[this.#s];
		if (!n) throw Error("Гейт исчез между проверкой и остановкой");
		await e.freezeAt(n.at), t.seekSeconds(n.at), this.#_();
	}
	#_() {
		let e = this.#o[this.#s];
		if (!e) throw Error("Нет гейта для открытия");
		this.#b(), this.#t.style.pointerEvents = "auto", this.#f("at-gate"), this.#r.onGateOpen?.(e.gate);
	}
	async answer(e) {
		if (this.#l !== "at-gate") throw Error(`Ответ вне гейта: состояние ${this.#l}`);
		let t = this.#o[this.#s];
		if (!t) throw Error("Нет открытого гейта");
		let { gate: n } = t, r = (this.#c.get(n.id) ?? 0) + 1;
		this.#c.set(n.id, r);
		let i = vl(n, e), a = n.maxAttempts !== null && r >= n.maxAttempts, o;
		o = i || n.onWrong === "continue" ? "continue" : n.onWrong === "reveal" || a ? "reveal" : "retry";
		let s = {
			gate: n,
			correct: i,
			attemptsUsed: r,
			outcome: o
		};
		return this.#r.onGateResolved?.(s), o === "continue" && await this.#v(), s;
	}
	async continueAfterReveal() {
		if (this.#l !== "at-gate") throw Error("Нет открытого гейта");
		await this.#v();
	}
	async #v() {
		let e = this.#x();
		this.#t.style.pointerEvents = "none", this.#s += 1, await e.resumeFromFreeze(), this.#f("playing"), this.#h();
	}
	#y() {
		this.#b(), this.#i?.stop(), this.#f("ended");
	}
	#b() {
		this.#u !== null && (cancelAnimationFrame(this.#u), this.#u = null);
	}
	destroy() {
		this.#b(), this.#d?.disconnect(), this.#i?.stop(), this.#i?.context.close(), this.#t.remove(), this.#f("idle");
	}
	#x() {
		if (!this.#i) throw Error("Плеер не загружен: сначала load()");
		return this.#i;
	}
	#S() {
		if (!this.#a) throw Error("Плеер не загружен: сначала load()");
		return this.#a;
	}
};
function vl(e, t) {
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
export { wo as AudioClock, Do as DEFAULT_STAGE_HEIGHT, Eo as DEFAULT_STAGE_WIDTH, _l as Player, vo as ProjectLoadError, jo as applyFit, gl as buildTimeline, hl as disableEngineMainLoop, Oo as fitStage, vl as isCorrect, yo as loadProject, Co as loadTrack, Ao as renderScene };
