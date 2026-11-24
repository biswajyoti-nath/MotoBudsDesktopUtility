import socket
import binascii
import struct
import time
import argparse
import sys
import json
import subprocess

import re

CLASSIC_MAC = "9C:CD:42:B7:1F:46"
RFCOMM_PORT = 28

def auto_detect_moto_buds():
    """
    Automatically detects connected or paired Motorola Buds and resolves
    the RFCOMM port (specifically the MOTOSPP channel).
    """
    detected_mac = None
    detected_port = None

    try:
        dev_proc = subprocess.run(["bluetoothctl", "devices"], capture_output=True, text=True, timeout=3)
        candidates = []
        for line in dev_proc.stdout.strip().split("\n"):
            match = re.search(r"Device\s+([0-9A-Fa-f:]{17})\s+(.+)$", line)
            if match:
                mac, name = match.group(1), match.group(2).strip()
                if re.search(r"(moto.*bud|motorola.*bud)", name, re.IGNORECASE):
                    candidates.append((mac, name))

        for mac, name in candidates:
            info_proc = subprocess.run(["bluetoothctl", "info", mac], capture_output=True, text=True, timeout=3)
            if "Connected: yes" in info_proc.stdout:
                detected_mac = mac
                break

        if not detected_mac and candidates:
            detected_mac = candidates[0][0]
    except Exception:
        pass

    target_mac = detected_mac or CLASSIC_MAC
    if target_mac and target_mac != "127.0.0.1":
        try:
            sdp_proc = subprocess.run(["sdptool", "search", "--bdaddr", target_mac, "SP"], capture_output=True, text=True, timeout=5)
            lines = sdp_proc.stdout.split("\n")
            in_motospp = False
            for line in lines:
                if "Service Name: MOTOSPP" in line or "fc9d9fe0-4899-11ee-be56-0242ac120002" in line:
                    in_motospp = True
                elif in_motospp and "Channel:" in line:
                    ch_match = re.search(r"Channel:\s*(\d+)", line)
                    if ch_match:
                        detected_port = int(ch_match.group(1))
                        break
                elif in_motospp and "Service Name:" in line:
                    in_motospp = False
        except Exception:
            pass

    return detected_mac, detected_port

HEAD = b"HEAD"
TAIL = b"TAIL"

EQ_PRESETS = {
    "harman_2019v2": [5.5, 4.5, 2.0, 0.0, 0.5, 1.5, 3.5, 2.0, -1.5, 1.0],
    "diffuse_field": [-2.0, -1.0, 0.0, 0.0, 0.5, 1.5, 3.0, 2.5, 0.5, 0.0],
    "harman_bass_boost": [7.5, 6.0, 2.5, -0.5, 0.0, 1.0, 2.5, 1.5, -1.0, 0.5],
    "vocal_midrange_clarity": [-1.5, -1.0, 0.0, 0.5, 1.5, 3.0, 4.0, 2.0, 0.0, -0.5],
    "treble_air_detail": [0.0, 0.0, -0.5, -0.5, 0.0, 1.0, 2.0, 3.5, 4.5, 3.5],
    "warm_relaxed": [3.5, 3.0, 2.0, 1.0, 0.5, 0.0, -1.0, -2.0, -3.0, -4.0],
    "dynamic_immersive": [6.0, 4.5, 1.5, -1.0, -1.5, 0.0, 2.0, 3.5, 4.0, 3.0],
    "flat": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
}

PRESET_ALIASES = {
    "harman in-ear target 2019v2": "harman_2019v2",
    "harman_in_ear_target_2019v2": "harman_2019v2",
    "harman": "harman_2019v2",
    "harman_2019": "harman_2019v2",
    "diffuse field / neutral studio": "diffuse_field",
    "diffuse_field_neutral_studio": "diffuse_field",
    "neutral_studio": "diffuse_field",
    "neutral": "diffuse_field",
    "harman bass boost": "harman_bass_boost",
    "bass_boost": "harman_bass_boost",
    "bass": "harman_bass_boost",
    "vocal & midrange clarity": "vocal_midrange_clarity",
    "vocal_clarity": "vocal_midrange_clarity",
    "vocal": "vocal_midrange_clarity",
    "treble & air detail": "treble_air_detail",
    "treble_detail": "treble_air_detail",
    "treble": "treble_air_detail",
    "warm & relaxed": "warm_relaxed",
    "warm": "warm_relaxed",
    "dynamic & immersive": "dynamic_immersive",
    "immersive": "dynamic_immersive",
    "dynamic": "dynamic_immersive",
}

def resolve_preset(name: str):
    if not name:
        return None
    key = str(name).strip().lower()
    if key in EQ_PRESETS:
        return EQ_PRESETS[key]
    key_norm = key.replace("-", "_").replace(" ", "_").replace("/", "_").replace("&", "_")
    while "__" in key_norm:
        key_norm = key_norm.replace("__", "_")
    key_norm = key_norm.strip("_")
    if key_norm in EQ_PRESETS:
        return EQ_PRESETS[key_norm]
    if key in PRESET_ALIASES:
        return EQ_PRESETS[PRESET_ALIASES[key]]
    if key_norm in PRESET_ALIASES:
        return EQ_PRESETS[PRESET_ALIASES[key_norm]]
    return None

class MotoBudsController:
    def __init__(self, mac_address=None, port=None, output_json=False, is_daemon=False):
        auto_mac, auto_port = None, None
        if not mac_address or mac_address == "auto":
            auto_mac, auto_port = auto_detect_moto_buds()
            self.mac_address = auto_mac or CLASSIC_MAC
        else:
            self.mac_address = mac_address

        if port is not None and port > 0:
            self.port = port
        elif self.mac_address == "127.0.0.1":
            self.port = port or 5001
        else:
            if auto_port is None:
                _, auto_port = auto_detect_moto_buds()
            self.port = auto_port or RFCOMM_PORT

        self.sock = None
        self.output_json = output_json
        self.is_daemon = is_daemon
        
    def log(self, msg):
        if self.is_daemon:
            print(json.dumps({"type": "log", "message": msg}), flush=True)
        elif not self.output_json:
            print(msg)

    def connect(self):
        if self.mac_address and self.mac_address != "127.0.0.1":
            try:
                subprocess.run(["bluetoothctl", "trust", self.mac_address], capture_output=True, timeout=2)
            except Exception:
                pass
        self.log(f"[*] Connecting to {self.mac_address} on Port {self.port}...")
        
        for attempt in range(5):
            try:
                if self.mac_address == "127.0.0.1":
                    self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                else:
                    self.sock = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
                self.sock.settimeout(3.0)
                self.sock.connect((self.mac_address, self.port))
                self.log("[+] Connected successfully!")
                self._initialization_handshake()
                return True
            except Exception as e:
                self.log(f"[-] Connection attempt {attempt+1} failed: {e}")
                if self.sock:
                    try:
                        self.sock.close()
                    except Exception:
                        pass
                    self.sock = None
                time.sleep(0.6)
                
        self.log("[-] Failed to connect after all attempts.")
        self.sock = None
        return False

    def disconnect(self):
        if self.sock:
            self.sock.close()
            self.sock = None
            self.log("[*] Disconnected.")

    def _create_packet(self, opcode: int, payload: bytes) -> bytes:
        packet = bytearray()
        packet.extend(HEAD)
        
        total_len = 8 + len(payload)
        packet.extend(total_len.to_bytes(2, byteorder='little'))
        
        packet.extend(opcode.to_bytes(2, byteorder='big'))
        packet.append(128)  
        packet.append(0)    
        packet.extend(len(payload).to_bytes(2, byteorder='little'))
        packet.extend(int(0).to_bytes(2, byteorder='little')) 
        
        packet.extend(payload)
        
        crc = binascii.crc32(packet) & 0xFFFFFFFF
        packet.extend(struct.pack('<I', crc))
        
        packet.extend(TAIL)
        return bytes(packet)

    def send_command(self, opcode: int, payload: bytes):
        if not self.sock:
            return
        packet = self._create_packet(opcode, payload)
        self.sock.send(packet)

    def _send_and_receive(self, opcode: int, payload: bytes, wait_for_response=True):
        if not self.sock:
            self.log("[-] Not connected.")
            return None
            
        self.send_command(opcode, payload)
        
        # In daemon mode, we must not synchronously wait for responses because the 
        # main thread is actively polling the socket. Doing so causes race conditions 
        # and thread deadlocks.
        if self.is_daemon or not wait_for_response:
            return None
            
        try:
            self.sock.settimeout(1.5)
            all_data = bytearray()
            chunk = self.sock.recv(4096)
            if chunk:
                all_data.extend(chunk)
                self.sock.settimeout(0.2)
                while True:
                    try:
                        more = self.sock.recv(4096)
                        if not more: break
                        all_data.extend(more)
                    except socket.timeout:
                        break
            self.sock.settimeout(3.0)
            return bytes(all_data) if all_data else None
        except socket.timeout:
            self.log(f"[-] Timeout waiting for response to opcode {hex(opcode)}")
            return None
        except Exception as e:
            self.log(f"[-] Error communicating: {e}")
            return None

    def _initialization_handshake(self):
        self.log("[*] Performing initialization handshake...")
        self._send_and_receive(0x0000, b"")
        time.sleep(0.2)
        self._send_and_receive(0x000B, b"\xfc\xff\x05\x00")
        time.sleep(0.2)
        self._send_and_receive(0x0010, b"")
        time.sleep(0.2)

    def read_battery(self):
        self.log("[*] Reading Battery Level...")
        resp = self._send_and_receive(0x0005, b"")
        if resp:
            self.log(f"[+] Raw Battery Response: {resp.hex()}")
        return resp.hex() if resp else None

    def get_hardware_info(self):
        self.log("[*] Reading Hardware Info...")
        resp = self._send_and_receive(0x0004, b"")
        if resp:
            self.log(f"[+] Raw Hardware Info: {resp.hex()}")
        return resp.hex() if resp else None

    def toggle_anc(self, mode: int, sub_mode: int):
        self.log(f"[*] Setting ANC Mode: {mode}, Sub-Mode: {sub_mode}")
        payload = bytes([mode, sub_mode])
        resp = self._send_and_receive(0x0201, payload)
        if resp:
            self.log(f"[+] Response: {resp.hex()}")
        return resp.hex() if resp else None

    def toggle_game_mode(self, enabled: int):
        self.log(f"[*] Setting Game Mode: {enabled}")
        resp = self._send_and_receive(0x030F, bytes([enabled]))
        return resp.hex() if resp else None

    def toggle_inear(self, enabled: int):
        self.log(f"[*] Setting In-Ear Detection: {enabled}")
        resp = self._send_and_receive(0x0403, bytes([enabled]))
        return resp.hex() if resp else None

    def toggle_volboost(self, enabled: int):
        self.log(f"[*] Setting Volume Boost: {enabled}")
        resp = self._send_and_receive(0x0314, bytes([enabled]))
        return resp.hex() if resp else None

    def toggle_hires(self, enabled: int):
        self.log(f"[*] Setting Hi-Res Mode: {enabled}")
        resp = self._send_and_receive(0x030D, bytes([enabled]))

        if self.mac_address and self.mac_address != "127.0.0.1":
            import subprocess

            mac_clean = self.mac_address.replace(":", "_")
            card_name = f"bluez_card.{mac_clean}"

            # Check if a2dp-sink-ldac is an available profile on the card
            try:
                cards_out = subprocess.run(["pactl", "list", "cards"], capture_output=True, text=True, timeout=3).stdout
                if card_name in cards_out and "a2dp-sink-ldac" in cards_out:
                    target_profile = "a2dp-sink-ldac" if enabled else "a2dp-sink"
                    self.log(f"[*] Switching card profile to {target_profile} seamlessly...")
                    subprocess.run(["pactl", "set-card-profile", card_name, target_profile], capture_output=True, timeout=3)
                else:
                    self.log(f"[*] Moto Buds model ({self.mac_address}) operates on high-fidelity AAC/SBC hardware. Audio stream remains active and uninterrupted.")
            except Exception as e:
                self.log(f"[-] Profile check error: {e}")

        return resp.hex() if resp else None

    def toggle_fit(self, start: int):
        self.log(f"[*] Setting Fit Test: {start}")
        resp = self._send_and_receive(0x0400, bytes([start]))
        return resp.hex() if resp else None

    def toggle_fmd(self, left: int, right: int):
        self.log(f"[*] Setting FMD: Left={left}, Right={right}")
        resp = self._send_and_receive(0x0405, bytes([left, right]))
        return resp.hex() if resp else None

    def set_custom_eq(self, bands):
        import struct
        float_bands = [float(b) for b in bands] if bands else [0.0] * 10
        max_gain = max(float_bands + [0.0])
        preamp = -max_gain if max_gain > 0 else 0.0
        self.log(f"[*] Setting Custom EQ (max gain: {max_gain:+.1f} dB, anti-clipping preamp: {preamp:+.1f} dB): {float_bands}")
        # 173 bytes payload for opcode 774 (0x0306)
        payload = bytearray([0x3F])
        payload.extend(struct.pack('<f', preamp)) # Negative Pre-amp to prevent clipping
        payload.extend(struct.pack('<f', 0.0))    # Post-amp
        payload.extend(struct.pack('<i', 10))     # Num bands
        
        freqs = [32.0, 64.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0]
        for i in range(10):
            gain = float(bands[i]) if i < len(bands) else 0.0
            payload.extend(struct.pack('<i', 0)) # Filter type
            payload.extend(struct.pack('<f', gain))
            payload.extend(struct.pack('<f', freqs[i]))
            payload.extend(struct.pack('<f', 0.75)) # Q Factor
            
        resp = self._send_and_receive(0x0306, bytes(payload))
        return resp.hex() if resp else None

    def apply_preset(self, preset_name: str):
        bands = resolve_preset(preset_name)
        if bands is None:
            self.log(f"[-] Unknown EQ preset: '{preset_name}'. Available: {list(EQ_PRESETS.keys())}")
            return None
        self.log(f"[*] Applying scientific EQ preset '{preset_name}'")
        return self.set_custom_eq(bands)

    def set_gesture(self, earbud: int, gesture_type: int, function_id: int):
        self.log(f"[*] Setting Gesture: Earbud={earbud}, Type={gesture_type}, Func={function_id}")
        resp = self._send_and_receive(0x0102, bytes([earbud, gesture_type, function_id]))
        return resp.hex() if resp else None

def main():
    parser = argparse.ArgumentParser(description="Moto Buds Controller")
    parser.add_argument("--battery", action="store_true", help="Read battery levels")
    parser.add_argument("--info", action="store_true", help="Read hardware info")
    parser.add_argument("--anc", type=int, choices=[0, 1, 2], help="Set ANC Mode (0=Off, 1=ANC, 2=Transparency)")
    parser.add_argument("--game", type=int, choices=[0, 1], help="Set Game Mode")
    parser.add_argument("--inear", type=int, choices=[0, 1], help="Set In-Ear Detection")
    parser.add_argument("--volboost", type=int, choices=[0, 1], help="Set Volume Boost")
    parser.add_argument("--hires", type=int, choices=[0, 1], help="Set Hi-Res/LDAC")
    parser.add_argument("--fit", type=int, choices=[0, 1], help="Set Fit Test (0=Stop, 1=Start)")
    parser.add_argument("--fmd", type=int, choices=[0, 1, 2, 3], help="Set Find My Device Mode")
    parser.add_argument("--daemon", action="store_true", help="Run as a long-lived bidirectional daemon using stdin/stdout")
    parser.add_argument("--keepalive", type=int, help="Keep SPP connection alive for N seconds to capture async events")
    parser.add_argument("--sync", action="store_true", help="Sync startup states (ANC, HiRes, Game, InEar)")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")
    parser.add_argument("--preset", type=str, help="Apply a scientifically tuned EQ preset (e.g. harman_2019v2, diffuse_field, harman_bass_boost, vocal_midrange_clarity, treble_air_detail, warm_relaxed, dynamic_immersive, flat)")
    parser.add_argument("--custom-eq", type=str, help="Apply custom 10-band EQ (comma-separated float gains, e.g. '5.5,4.5,2.0,0.0,0.5,1.5,3.5,2.0,-1.5,1.0')")
    parser.add_argument("--mac", type=str, default=None, help="MAC address (default: auto-detect)")
    parser.add_argument("--port", type=int, default=None, help="Port (default: auto-detect)")
    
    args = parser.parse_args()
    
    if not any([args.battery, args.info, args.anc is not None, args.game is not None, args.inear is not None, args.volboost is not None, args.hires is not None, args.fit is not None, args.fmd is not None, args.sync, args.daemon, args.preset is not None, args.custom_eq is not None]):
        parser.print_help()
        sys.exit(1)

    # If this is a UI command or daemon startup, terminate any orphaned background instances
    # to release RFCOMM port locks and prevent [Errno 77] File descriptor in bad state.
    try:
        import os, subprocess
        my_pid = os.getpid()
        out = subprocess.run(["pgrep", "-f", "moto_control.py.*--(daemon|keepalive)"], capture_output=True, text=True).stdout.split()
        killed = False
        for pid_str in out:
            p = int(pid_str)
            if p != my_pid:
                try:
                    os.kill(p, 15)
                    killed = True
                except Exception:
                    pass
        if killed:
            time.sleep(0.5)
    except Exception:
        pass

    controller = MotoBudsController(mac_address=args.mac, port=args.port, output_json=args.json, is_daemon=args.daemon)
    
    if args.daemon:
        if not controller.connect():
            print(json.dumps({"type": "error", "message": "Failed to connect to earbuds"}))
            sys.exit(1)
            
        print(json.dumps({"type": "status", "status": "connected"}), flush=True)
        
        import subprocess
        subprocess.Popen("killall -q mpris-proxy ; sleep 0.5 ; mpris-proxy &", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        
        import signal, threading
        running = [True]
        def sig_handler(signum, frame):
            running[0] = False
        try:
            signal.signal(signal.SIGINT, sig_handler)
            signal.signal(signal.SIGTERM, sig_handler)
        except Exception:
            pass

        def stdin_listener():
            try:
                for line in sys.stdin:
                    if not running[0]:
                        break
                    line = line.strip()
                    if not line: continue
                    try:
                        cmd = json.loads(line)
                    op = cmd.get("op")
                    if op == "anc":
                        sub_mode = 1 if cmd.get("mode") == 1 else 0
                        controller.toggle_anc(cmd.get("mode"), sub_mode)
                    elif op == "game":
                        controller.toggle_game_mode(cmd.get("enabled"))
                    elif op == "inear":
                        controller.toggle_inear(cmd.get("enabled"))
                    elif op == "volboost":
                        controller.toggle_volboost(cmd.get("enabled"))
                    elif op == "hires":
                        controller.toggle_hires(cmd.get("enabled"))
                    elif op == "fit":
                        controller.toggle_fit(cmd.get("enabled"))
                    elif op == "fmd":
                        controller.toggle_fmd(int(cmd.get("left", 0)), int(cmd.get("right", 0)))
                    elif op == "eq":
                        if "preset" in cmd and cmd["preset"]:
                            controller.apply_preset(cmd.get("preset"))
                        elif "bands" in cmd:
                            controller.set_custom_eq(cmd.get("bands"))
                    elif op == "preset":
                        controller.apply_preset(cmd.get("preset") or cmd.get("name"))
                    elif op == "gesture":
                        controller.set_gesture(cmd.get("earbud"), cmd.get("gesture"), cmd.get("func"))
                    elif op == "sync":
                        res_anc = controller._send_and_receive(0x0200, b"")
                        res_hires = controller._send_and_receive(0x030C, b"")
                        res_game = controller._send_and_receive(0x030E, b"")
                        res_inear = controller._send_and_receive(0x0402, b"")
                        res_gestures = controller._send_and_receive(0x0100, b"")
                        sync_data = {}
                        if res_anc: sync_data["anc_raw"] = res_anc.hex()
                        if res_hires: sync_data["hires_raw"] = res_hires.hex()
                        if res_game: sync_data["game_raw"] = res_game.hex()
                        if res_inear: sync_data["inear_raw"] = res_inear.hex()
                        if res_gestures: sync_data["gestures_raw"] = res_gestures.hex()
                        print(json.dumps({"type": "sync", "data": sync_data}), flush=True)
                    elif op == "battery":
                        res = controller.read_battery()
                        print(json.dumps({"type": "battery", "data": res}), flush=True)
                    elif op == "info":
                        res = controller.get_hardware_info()
                        print(json.dumps({"type": "info", "data": res}), flush=True)
                except Exception as e:
                    controller.log(f"[-] Daemon JSON command error: {e}")
            except Exception:
                pass
            running[0] = False
        
        # Start the thread that listens to commands from Electron
        t = threading.Thread(target=stdin_listener, daemon=True)
        t.start()
        
        # Main thread acts as the async event polling loop
        controller.sock.settimeout(0.5)
        while running[0]:
            try:
                data = controller.sock.recv(1024)
                if data:
                    print(json.dumps({"type": "event", "data": data.hex()}), flush=True)
            except socket.timeout:
                continue
            except Exception as e:
                if not running[0]:
                    break
                print(json.dumps({"type": "error", "message": f"Connection dropped, attempting to reconnect... ({e})"}), flush=True)
                controller.disconnect()
                time.sleep(2)
                
                reconnected = False
                for attempt in range(5):
                    if not running[0]:
                        break
                    time.sleep(1.5)
                    if controller.connect():
                        reconnected = True
                        print(json.dumps({"type": "status", "status": "connected"}), flush=True)
                        import subprocess
                        subprocess.Popen("killall -q mpris-proxy ; sleep 0.5 ; mpris-proxy &", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        break
                        
                if not reconnected and running[0]:
                    print(json.dumps({"type": "error", "message": "Failed to reconnect after device reset."}), flush=True)
                    break
                
        controller.disconnect()
        sys.exit(0)

    results = {"status": "success", "data": {}}
    
    if controller.connect():
        if args.battery:
            res = controller.read_battery()
            results["data"]["battery_raw"] = res
        if args.info:
            res = controller.get_hardware_info()
            results["data"]["hardware_raw"] = res
        if args.anc is not None:
            sub_mode = 1 if args.anc == 1 else 0
            res = controller.toggle_anc(args.anc, sub_mode)
            results["data"]["anc_response"] = res
        if args.game is not None:
            res = controller.toggle_game_mode(args.game)
            results["data"]["game_response"] = res
        if args.inear is not None:
            res = controller.toggle_inear(args.inear)
            results["data"]["inear_response"] = res
        if args.volboost is not None:
            res = controller.toggle_volboost(args.volboost)
            results["data"]["volboost_response"] = res
        if args.hires is not None:
            res = controller.toggle_hires(args.hires)
            results["data"]["hires_response"] = res
        if args.fit is not None:
            res = controller.toggle_fit(args.fit)
            results["data"]["fit_response"] = res
        if args.fmd is not None:
            res = controller.toggle_fmd(args.fmd)
            results["data"]["fmd_response"] = res
        if args.preset is not None:
            res = controller.apply_preset(args.preset)
            results["data"]["preset_response"] = res
            results["data"]["preset"] = args.preset
            bands = resolve_preset(args.preset)
            if bands:
                results["data"]["bands"] = bands
                max_gain = max(bands + [0.0])
                results["data"]["preamp_db"] = -max_gain if max_gain > 0 else 0.0
        if args.custom_eq is not None:
            try:
                bands = [float(x.strip()) for x in args.custom_eq.split(",")]
                res = controller.set_custom_eq(bands)
                results["data"]["custom_eq_response"] = res
                results["data"]["bands"] = bands
                max_gain = max(bands + [0.0])
                results["data"]["preamp_db"] = -max_gain if max_gain > 0 else 0.0
            except Exception as e:
                controller.log(f"[-] Invalid --custom-eq format: {e}")
                results["data"]["custom_eq_error"] = str(e)

        if args.sync:
            # Opcode 512, 780, 782, 1026
            res_anc = controller._send_and_receive(0x0200, b"")
            res_hires = controller._send_and_receive(0x030C, b"")
            res_game = controller._send_and_receive(0x030E, b"")
            res_inear = controller._send_and_receive(0x0402, b"")
            res_gestures = controller._send_and_receive(0x0100, b"")
            if res_anc: results["data"]["anc_raw"] = res_anc.hex()
            if res_hires: results["data"]["hires_raw"] = res_hires.hex()
            if res_game: results["data"]["game_raw"] = res_game.hex()
            if res_inear: results["data"]["inear_raw"] = res_inear.hex()
            if res_gestures: results["data"]["gestures_raw"] = res_gestures.hex()

        if args.keepalive:
            controller.log(f"[*] Keeping connection alive for {args.keepalive} seconds...")
            start_t = time.time()
            async_events = []
            try:
                controller.sock.settimeout(1.0)
                while time.time() - start_t < args.keepalive:
                    try:
                        data = controller.sock.recv(1024)
                        if data:
                            async_events.append(data.hex())
                            controller.log(f"[+] Async Event: {data.hex()}")
                    except socket.timeout:
                        continue
            except Exception as e:
                controller.log(f"[-] Keepalive error: {e}")
            finally:
                controller.sock.settimeout(2.0)
            results["data"]["async_events"] = async_events
            
        controller.disconnect()
    else:
        results["status"] = "error"
        results["message"] = "Failed to connect to earbuds"

    if args.json:
        print(json.dumps(results))

if __name__ == "__main__":
    main()
