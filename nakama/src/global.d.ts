// nakama-runtime ships an ambient `declare namespace nkruntime { ... }` at
// its package root (not under @types/), so the normal "types" compiler-option
// name resolution (which only searches node_modules/@types) can't find it.
// A path reference sidesteps that and always resolves regardless of the
// "types" list above.
/// <reference path="../node_modules/nakama-runtime/index.d.ts" />
