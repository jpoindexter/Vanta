---
name: eval-awareness-red-team
description: Red-team AI evaluations for test recognition, metagaming, prompt-placement effects, grader inference, and appearance management. Use when an agent may know it is being evaluated, behaves differently on benchmark-like tasks, reasons about hidden grading criteria, or when an eval may be gamed by recognizing its setup.
---

# Evaluation-Awareness Red Team

Test the instrument, not only the model.

1. Predeclare the behavior and claim the evaluation is meant to support.
2. Create semantically matched ordinary, benchmark-like, and disguised task forms.
3. Vary authority-conflict placement across system, developer, user, retrieved
   context, and out-of-context state where supported.
4. Run with and without explicit recall hints. A hint may activate the construct
   while simultaneously making the test recognizable.
5. Add canary phrases that reveal memorized public fixtures without affecting the
   task outcome.
6. Compare final actions and tool receipts before consulting self-report.
7. Treat prompt-channel instability or changed behavior under disguise as an
   instrument limitation.

Do not publish live holdout instances or expected outputs. Publish generators,
schemas, and synthetic examples instead. A test-recognition finding does not by
itself establish reward-seeking; it shows that the evaluation's readout may be
contaminated.

Return the variants, fixed variables, detection signals, observed contamination,
and the redesign required before the eval can support its intended claim.
