import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// src/md5.js 是经典脚本（为内容脚本提供全局 md5），这里用 vm 加载后取全局函数。
// vm 沙箱默认没有 TextEncoder，需显式注入以模拟浏览器全局环境。
const src = readFileSync(new URL("../src/md5.js", import.meta.url), "utf8");
const sandbox = { TextEncoder };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const md5 = sandbox.md5;
assert.equal(typeof md5, "function");

// 期望值均以系统 md5sum 独立校验（见提交说明），覆盖空串、短串、多区块长串与非 ASCII。
test("md5 matches known vectors", () => {
  assert.equal(md5(""), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(md5("abc"), "900150983cd24fb0d6963f7d28e17f72");
  assert.equal(md5("hello"), "5d41402abc4b2a76b9719d911017c592");
  assert.equal(md5("The quick brown fox jumps over the lazy dog"), "9e107d9d372bb6826bd81d3542a419d6");
  assert.equal(md5("链动小铺"), "27b10d473aa31f7a59d8315a1ab9ca12");
  assert.equal(md5("1234567890".repeat(10)), "49cb3608e2b33fad6b65df8cb8f49668");
});

test("captcha signature construction is deterministic 32-hex", () => {
  const sign = (code, ip) => md5(`${md5(`${code}${ip}`)}JING`);
  const first = sign("1234", "1.2.3.4");
  assert.match(first, /^[0-9a-f]{32}$/);
  assert.equal(first, sign("1234", "1.2.3.4"));
  assert.notEqual(first, sign("1235", "1.2.3.4"));
  assert.notEqual(first, sign("1234", "1.2.3.5"));
});
