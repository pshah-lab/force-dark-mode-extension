# Writes tests/fixtures/rc4_r3.pdf: a tiny RC4-128 (V2/R3) encrypted PDF built with only the Python
# standard library, so the JS decrypter is checked against an independent implementation.
# User password: "legacy". Owner password: "ownerpw".
import hashlib, struct, os, sys
PAD = bytes.fromhex("28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A")
def rc4(key, data):
    s = list(range(256)); j = 0
    for i in range(256):
        j = (j + s[i] + key[i % len(key)]) % 256; s[i], s[j] = s[j], s[i]
    out = bytearray(); i = j = 0
    for b in data:
        i = (i + 1) % 256; j = (j + s[i]) % 256; s[i], s[j] = s[j], s[i]
        out.append(b ^ s[(s[i] + s[j]) % 256])
    return bytes(out)
md5 = lambda b: hashlib.md5(b).digest()
pad = lambda pw: (pw + PAD)[:32]
user, owner = b"legacy", b"ownerpw"
ID0 = bytes(range(16))
P = -3904
h = md5(pad(owner))
for _ in range(50): h = md5(h)
okey = h[:16]
O = rc4(okey, pad(user))
for i in range(1, 20): O = rc4(bytes(b ^ i for b in okey), O)
k = md5(pad(user) + O + struct.pack("<i", P) + ID0)
for _ in range(50): k = md5(k[:16])
key = k[:16]
U = rc4(key, md5(PAD + ID0))
for i in range(1, 20): U = rc4(bytes(b ^ i for b in key), U)
U += b"\x00" * 16
def okeyfor(n): return md5(key + struct.pack("<I", n)[:3] + b"\x00\x00")[:16]
def hexs(b): return "<" + b.hex() + ">"
content = b"BT /F1 24 Tf 20 100 Td (Hello legacy) Tj ET"
enc_content = rc4(okeyfor(4), content)
title = rc4(okeyfor(5), "Legacy RC4 title".encode("latin1"))
objs = {
 1: b"<< /Type /Catalog /Pages 2 0 R >>",
 2: b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
 3: b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>",
 4: b"<< /Length %d >>\nstream\n" % len(enc_content) + enc_content + b"\nendstream",
 5: ("<< /Title " + hexs(title) + " >>").encode(),
 6: ("<< /Filter /Standard /V 2 /R 3 /Length 128 /P %d /O %s /U %s >>" % (P, hexs(O), hexs(U))).encode(),
}
out = bytearray(b"%PDF-1.4\n"); offs = {}
for n in sorted(objs):
    offs[n] = len(out); out += b"%d 0 obj\n" % n + objs[n] + b"\nendobj\n"
xref = len(out)
out += b"xref\n0 7\n0000000000 65535 f \n"
for n in range(1, 7): out += b"%010d 00000 n \n" % offs[n]
out += ("trailer\n<< /Size 7 /Root 1 0 R /Info 5 0 R /Encrypt 6 0 R /ID [%s %s] >>\nstartxref\n%d\n%%%%EOF\n" % (hexs(ID0), hexs(ID0), xref)).encode()
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "rc4_r3.pdf"), "wb").write(out)
