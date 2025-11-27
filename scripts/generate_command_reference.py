#!/usr/bin/env python3
"""Generate markdown documentation for slash commands."""

from __future__ import annotations

import ast
from pathlib import Path
from typing import Dict, List, Optional

REPO_ROOT = Path(__file__).resolve().parents[1]
BOT_ROOT = REPO_ROOT / "bot"
COMMANDS_DIR = BOT_ROOT / "src" / "commands"
OUTPUT = REPO_ROOT / "docs" / "command_reference.md"


def attr_name(node: ast.AST) -> str:
  if isinstance(node, ast.Attribute):
    return f"{attr_name(node.value)}.{node.attr}"
  if isinstance(node, ast.Name):
    return node.id
  return ""


def const_value(node: Optional[ast.AST]) -> Optional[str]:
  if isinstance(node, ast.Constant) and isinstance(node.value, str):
    return node.value
  return None


def kw_value(call: ast.Call, key: str) -> Optional[str]:
  for kw in call.keywords:
    if kw.arg == key:
      return const_value(kw.value)
  return None


def extract_groups(module: ast.Module) -> Dict[str, Dict[str, str]]:
  groups: Dict[str, Dict[str, str]] = {}

  class Collector(ast.NodeVisitor):
    def visit_Assign(self, node: ast.Assign):
      if isinstance(node.value, ast.Call):
        func_name = attr_name(node.value.func)
        if func_name.endswith("app_commands.Group"):
          for target in node.targets:
            if isinstance(target, ast.Name):
              groups[target.id] = {
                "name": kw_value(node.value, "name") or target.id,
                "description": kw_value(node.value, "description") or "",
              }
      self.generic_visit(node)

  Collector().visit(module)
  return groups


def extract_commands(path: Path) -> List[Dict[str, str]]:
  tree = ast.parse(path.read_text("utf-8"))
  groups = extract_groups(tree)
  results: List[Dict[str, str]] = []

  for node in tree.body:
    if isinstance(node, ast.ClassDef):
      class_name = node.name
      for item in node.body:
        if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
          info = command_info(item, groups)
          if info:
            info["module"] = str(path.relative_to(BOT_ROOT))
            info["class"] = class_name
            results.append(info)
  return results


FuncType = ast.FunctionDef | ast.AsyncFunctionDef


def command_info(func: FuncType, groups: Dict[str, Dict[str, str]]) -> Optional[Dict[str, str]]:
  for deco in func.decorator_list:
    if isinstance(deco, ast.Call):
      target = attr_name(deco.func)
      if target.endswith("app_commands.command"):
        return build_command_record(func, deco, None)
      if target.endswith(".command"):
        group_var = target.rsplit(".", 1)[0]
        key = group_var.split(".")[-1]
        group = groups.get(key) or {"name": key, "description": ""}
        return build_command_record(func, deco, group)
  return None


def build_command_record(
  func: FuncType,
  decorator: ast.Call,
  group: Optional[Dict[str, str]],
) -> Dict[str, str]:
  name = kw_value(decorator, "name") or func.name
  description = kw_value(decorator, "description") or (ast.get_docstring(func) or "")
  description = description.strip().splitlines()[0] if description else ""
  if group:
    full_name = f"{group['name']} {name}"
  else:
    full_name = name
  return {
    "command": full_name,
    "description": description,
    "function": func.name,
  }


def generate() -> None:
  entries: List[Dict[str, str]] = []
  for path in sorted(COMMANDS_DIR.glob("*.py")):
    if path.name.startswith("__"):
      continue
    entries.extend(extract_commands(path))

  entries.sort(key=lambda item: item["command"].lower())
  lines = ["# Slash Command Reference", "", "| Command | Description | Source |", "| --- | --- | --- |"]
  for entry in entries:
    source = f"{entry['module']}::{entry['class']}.{entry['function']}"
    desc = entry["description"].replace("|", "\\|")
    lines.append(f"| `/{entry['command']}` | {desc or '_No description_'} | `{source}` |")

  OUTPUT.write_text("\n".join(lines) + "\n", "utf-8")
  print(f"Wrote {len(entries)} commands to {OUTPUT}")


if __name__ == "__main__":
  generate()
