//! The tables as JSON for the client, through one small writer (also used for the snapshot schema).

use super::*;
use std::fmt::Display;

/// A JSON object written field by field, keys in the order given.
#[derive(Default)]
pub(crate) struct Obj(String);

impl Obj {
    pub fn new() -> Obj {
        Obj::default()
    }
    /// A field whose value is already JSON.
    pub fn raw(mut self, key: &str, json: impl Display) -> Obj {
        if !self.0.is_empty() {
            self.0.push(',');
        }
        self.0 += &format!("\"{key}\":{json}");
        self
    }
    /// A number or a boolean.
    pub fn num(self, key: &str, v: impl Display) -> Obj {
        self.raw(key, v)
    }
    pub fn str(self, key: &str, v: &str) -> Obj {
        self.raw(key, quote(v))
    }
    pub fn done(self) -> String {
        format!("{{{}}}", self.0)
    }
}

/// A JSON string (the tables hold no quotes or backslashes, but a name with one stays valid).
pub(crate) fn quote(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// A JSON array of values that are already JSON.
pub(crate) fn array<T: Display>(items: impl IntoIterator<Item = T>) -> String {
    format!(
        "[{}]",
        items
            .into_iter()
            .map(|i| i.to_string())
            .collect::<Vec<_>>()
            .join(",")
    )
}

/// A JSON object of (key, JSON value) pairs, in order.
fn map(items: impl IntoIterator<Item = (&'static str, String)>) -> String {
    items
        .into_iter()
        .fold(Obj::new(), |o, (k, v)| o.raw(k, v))
        .done()
}

fn keys<T>(xs: &[T], key: impl Fn(&T) -> &'static str) -> String {
    array(xs.iter().map(|x| quote(key(x))))
}

fn proj(p: Option<ProjKind>) -> &'static str {
    match p {
        Some(ProjKind::Bolt) => "\"bolt\"",
        Some(ProjKind::Shell) => "\"shell\"",
        Some(ProjKind::Missile) => "\"missile\"",
        None => "null",
    }
}

fn req(b: Option<BldgKind>) -> String {
    b.map_or("null".to_string(), |b| quote(b.def().key))
}

fn unit(d: &UnitDef) -> String {
    Obj::new()
        .str("name", d.name)
        .num("worker", d.worker)
        .num("shields", d.shields)
        .raw("cost", array(d.cost))
        .num("supply", d.supply)
        .num("hp", d.hp)
        .num("armor", d.armor)
        .num("speed", d.speed)
        .num("range", d.range)
        .num("dmg", d.dmg)
        .num("dmgAir", d.dmg_air)
        .num("cd", d.cd)
        .num("sight", d.sight)
        .num("r", d.r)
        .num("build", d.build)
        .num("melee", d.melee)
        .raw("proj", proj(d.proj))
        .num("air", d.air)
        .num("bio", d.bio)
        .num("heal", d.heal)
        .raw("req", req(d.req))
        .num("upDmg", d.up_dmg)
        .done()
}

fn bldg(d: &BldgDef) -> String {
    Obj::new()
        .str("name", d.name)
        .str("short", d.short)
        .num("hq", d.hq)
        .num("shields", d.shields)
        .num("needsPower", d.needs_power)
        .num("power", d.power)
        .raw("researches", keys(d.researches, |u| u.def().key))
        .raw("cost", array(d.cost))
        .num("w", d.w)
        .num("h", d.h)
        .num("hp", d.hp)
        .num("armor", d.armor)
        .num("supply", d.supply)
        .num("build", d.build)
        .num("sight", d.sight)
        .raw("trains", keys(d.trains, |u| u.def().key))
        .num("dropoff", d.dropoff)
        .num("onVent", d.on_vent)
        .raw("req", req(d.req))
        .num("range", d.range)
        .num("dmg", d.dmg)
        .num("dmgAir", d.dmg_air)
        .num("cd", d.cd)
        .raw("proj", proj(d.proj))
        .num("upDmg", d.up_dmg)
        .done()
}

fn upgrade(d: &UpgradeDef) -> String {
    let effect = match d.effect {
        Effect::Weapons => "weapons",
        Effect::Armor => "armor",
        Effect::Shields => "shields",
    };
    Obj::new()
        .str("name", d.name)
        .str("effect", effect)
        .raw("cost", array(d.cost.map(array)))
        .raw("time", array(d.time))
        .done()
}

fn diff(d: &Diff) -> String {
    Obj::new()
        .num("income", d.income)
        .num("wave", d.wave)
        .num("waveGrow", d.wave_grow)
        .num("harv", d.harv)
        .num("rax", d.rax)
        .num("first", d.first)
        .num("gap", d.gap)
        .done()
}

fn faction(f: &Faction) -> String {
    Obj::new()
        .str("name", f.name)
        .str("hq", f.hq.def().key)
        .str("worker", f.worker.def().key)
        .raw("buildBasic", keys(f.build_basic, |k| k.def().key))
        .raw("buildAdvanced", keys(f.build_advanced, |k| k.def().key))
        .str("supply", f.supply.def().key)
        .str("ether", f.ether.def().key)
        .raw(
            "power",
            f.power.map_or("null".to_string(), |k| quote(k.def().key)),
        )
        .num("repairs", f.repairs)
        .num("warp", f.warp)
        .done()
}

/// The tables as JSON: build:wasm writes them to src/engine/pkg/data.js, the client's single source of game numbers.
pub fn data_json() -> String {
    let consts = Obj::new()
        .num("tile", TILE)
        .num("mw", MW)
        .num("mh", MH)
        .num("dt", DT)
        .num("player", PLAYER)
        .num("enemy", ENEMY)
        .done();
    Obj::new()
        .raw("consts", consts)
        .raw(
            "units",
            map(UNIT_KINDS.map(|k| (k.def().key, unit(k.def())))),
        )
        .raw(
            "buildings",
            map(BLDG_KINDS.map(|k| (k.def().key, bldg(k.def())))),
        )
        .raw(
            "upgrades",
            map(UPGRADES.map(|u| (u.def().key, upgrade(u.def())))),
        )
        .raw("diff", array(DIFF.iter().map(diff)))
        .raw("factions", map(FACTIONS.map(|f| (f.key, faction(f)))))
        .done()
}
