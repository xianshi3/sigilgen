# Security Policy

Sigilgen is a build-time, offline, deterministic logo generator. It reads curated JSON data from
its own package and writes SVG strings to disk or stdout. It performs **no network requests, opens
no sockets, executes no child processes, and requires no credentials**. That design makes the
attack surface small — but not empty, because it parses untrusted inputs (brand names, keywords,
CLI flags) and writes files.

## Supported Versions

| Version | Supported | Notes                                         |
| ------- | --------- | --------------------------------------------- |
| `1.x`   | ✅        | Current stable line. Receives security fixes. |
| `< 1.0` | ❌        | Pre-release milestones are not patched.       |

Only the latest `1.x` release line is supported. Pin your dependency and upgrade promptly.

## Reporting a Vulnerability

**Do not open a public GitHub issue for a security problem.**

Report privately through one of these channels:

1. **GitHub Security Advisories** — use _Security → Report a vulnerability_ on the Security tab of
   the repository (preferred; it is the only channel that supports private threads).
2. **Private email to the maintainer** — `security@<repository-domain>`; see the repository
   homepage for the current address.

Include, as far as you can:

- Type of issue and the affected version.
- A minimal reproduction (CLI invocation, or the smallest `generateLogo` call that reproduces it).
- The exact input string(s) that trigger the behaviour.
- Any proof-of-concept output, crash log, or trace.
- Impact assessment and whether the issue is already public.

If you are unsure whether something is a vulnerability, report it privately anyway. You will not be
penalised for a good-faith report that turns out not to be exploitable.

## Response Expectations

| Stage                                  | Target                               |
| -------------------------------------- | ------------------------------------ |
| Acknowledgement of your report         | within 3 business days               |
| Initial triage and severity assessment | within 7 business days               |
| Fix released for Critical/High issues  | within 30 days of confirmed triage   |
| Fix released for Medium/Low issues     | next scheduled minor release         |
| Public disclosure, when fixed          | coordinated, after the release ships |

If triage takes longer than the targets above, you will get an update explaining why.

## Coordinated Disclosure Policy

- We follow **coordinated disclosure**. We publish an advisory and a patched release _first_, then
  discuss the issue publicly.
- **Disclosure window:** 90 days from the initial report, or 30 days after a fix ships, whichever
  comes first. If a fix needs longer, we will say so and agree on a revised date with the reporter.
- We request that you do not disclose details, publish proof-of-concept code, or contact third
  parties until the advisory is public.
- We will credit you in the advisory by name or handle, if you want the credit. Tell us how you
  would like to be named.
- We will not pursue legal action over good-faith research that follows this policy.

## Scope

**In scope**

- Any code path in `src/` that mishandles untrusted input: `name`, `keywords`, `brief`, `seed`,
  CLI flags, or JSON Brain data.
- SVG injection: cases where attacker-controlled input escapes the intended `fill`/`stroke`/`d`
  attribute and injects extra markup, script, or external references into the emitted `<svg>`.
- Path traversal or arbitrary file read/write triggered by CLI input (`--output`, `--json`,
  `--png`, `--png-size`).
- Denial of service in the library: inputs that cause unbounded memory growth or effectively
  non-terminating computation.
- Release-supply-chain issues: a published artifact containing unexpected code.

**Out of scope**

- Design or aesthetic complaints, or disagreements about the curated JSON Brain contents.
- Generated logos being "ugly", or not matching a subjective brand brief.
- Findings that require the operator to already have arbitrary code execution (for example a
  tampered `node_modules`, or a modified local copy of the JSON Brain files).
- Vulnerabilities in optional third-party tooling (such as `sharp`), which are tracked upstream.
- Reports generated entirely by an automated scanner with no demonstrated impact.
- Missing hardening headers in generated SVG. Emitted SVG is a static asset; host it behind your
  own headers.

## Notes for maintainers

Security-relevant invariants are enforced by tests in `tests/` so regressions fail CI:

- The serializer rejects any character outside a conservative allow-list before it enters an
  attribute value.
- The serializer never emits `<script>`, `on*` event attributes, external `href`/`xlink:href`
  references, or `foreignObject`.
- The CLI resolves and contains its output directory before writing, and writes only the file
  extensions it advertises.
