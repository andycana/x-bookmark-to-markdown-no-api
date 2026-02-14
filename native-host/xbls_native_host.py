#!/usr/bin/env python3
"""
Native messaging host for x-bookmark-local.

Supported actions:
- ping
- pick_folder
- write_text_file
- download_url_to_file
"""

import json
import os
import struct
import sys
import urllib.request


def read_message():
    raw_len = sys.stdin.buffer.read(4)
    if len(raw_len) < 4:
        return None
    length = struct.unpack("<I", raw_len)[0]
    payload = sys.stdin.buffer.read(length)
    if len(payload) < length:
        return None
    return json.loads(payload.decode("utf-8"))


def send_message(message):
    data = json.dumps(message, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def choose_folder():
    try:
        import tkinter as tk
        from tkinter import filedialog
    except Exception as exc:
        return {"success": False, "error": "tkinter unavailable: %s" % exc}

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    try:
        selected = filedialog.askdirectory(title="Choose folder for X Bookmark Markdown files")
    finally:
        root.destroy()

    if not selected:
        return {"success": False, "error": "cancelled"}

    return {
        "success": True,
        "path": os.path.abspath(selected),
    }


def split_relative_path(relative_path):
    value = str(relative_path or "").strip().replace("\\", "/")
    if not value:
        return None, "relative path is empty"

    parts = []
    for raw in value.split("/"):
        part = raw.strip()
        if not part or part == ".":
            continue
        if part == "..":
            return None, "relative path contains .."
        if "\x00" in part:
            return None, "relative path contains null byte"
        if any(ch in part for ch in '<>:"|?*'):
            return None, "relative path contains invalid filename chars"
        parts.append(part)

    if not parts:
        return None, "relative path has no segments"

    return parts, None


def resolve_target(folder_path, relative_path):
    folder = os.path.abspath(os.path.expanduser(str(folder_path or "").strip()))
    if not folder:
        return None, "folder path is empty"

    parts, err = split_relative_path(relative_path)
    if err:
        return None, err

    target = os.path.abspath(os.path.join(folder, *parts))
    try:
        if os.path.commonpath([folder, target]) != folder:
            return None, "target escaped root folder"
    except ValueError:
        return None, "path drive mismatch"

    return target, None


def ensure_parent(path):
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)


def uniquify_path(path):
    if not os.path.exists(path):
        return path

    base, ext = os.path.splitext(path)
    index = 1
    while index < 500:
        candidate = f"{base} ({index}){ext}"
        if not os.path.exists(candidate):
            return candidate
        index += 1
    return path


def write_text_file(folder_path, relative_path, content):
    target, err = resolve_target(folder_path, relative_path)
    if err:
        return {"success": False, "error": err}

    try:
        target = uniquify_path(target)
        ensure_parent(target)
        with open(target, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(str(content or ""))
        return {"success": True, "path": target}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def download_url_to_file(folder_path, relative_path, url):
    target, err = resolve_target(folder_path, relative_path)
    if err:
        return {"success": False, "error": err}

    source = str(url or "").strip()
    if not source:
        return {"success": False, "error": "url is empty"}

    try:
        target = uniquify_path(target)
        ensure_parent(target)
        request = urllib.request.Request(
            source,
            headers={"User-Agent": "Mozilla/5.0 (x-bookmark-local-native-host)"},
        )
        with urllib.request.urlopen(request, timeout=45) as response:
            data = response.read()
        with open(target, "wb") as handle:
            handle.write(data)
        return {"success": True, "path": target, "bytes": len(data)}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def main():
    message = read_message()
    if message is None:
        return

    action = str(message.get("action", "")).strip()

    if action == "ping":
        send_message({"success": True, "version": "1.0.0"})
        return

    if action == "pick_folder":
        send_message(choose_folder())
        return

    if action == "write_text_file":
        send_message(
            write_text_file(
                message.get("folder_path", ""),
                message.get("relative_path", ""),
                message.get("content", ""),
            )
        )
        return

    if action == "download_url_to_file":
        send_message(
            download_url_to_file(
                message.get("folder_path", ""),
                message.get("relative_path", ""),
                message.get("url", ""),
            )
        )
        return

    send_message({"success": False, "error": "unknown action: %s" % action})


if __name__ == "__main__":
    main()
