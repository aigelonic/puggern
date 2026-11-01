# Spelling correction feedback

After an incorrect answer, the full correct spelling stays prominent. A secondary “Du skrev” row and a short Norwegian change summary make the difference specific; the comparison is fixed while the learner retypes. Once the correction is acknowledged, later recall prompts have no comparison or prefilled answer.

The comparison uses minimum-edit alignment over normalized grapheme clusters. Ties prefer equality, adjacent transposition, substitution, deletion, then insertion. Normalized units retain their source grapheme indexes, so ignored case, accents, and outer whitespace are not marked. If a safe one-to-one mapping cannot be established, the interface shows both spellings without letter-level marks and provides a generic instruction. The learning engine remains authoritative for accepted answers.

This design applies the principles of specific corrective feedback after an independent attempt and subsequent retrieval practice (Shute, 2008; Dunlosky et al., 2013). These reviews support the underlying principles, not the optimality of this particular interface for Puggern or all children. Child usability and retention remain future validation.

- [Substitution](screenshots/spelling-substitution.png)
- [Missing letter](screenshots/spelling-missing.png)
- [Extra letter](screenshots/spelling-extra.png)
- [Adjacent transposition](screenshots/spelling-transposition.png)

- Shute, V. J. (2008). [Focus on formative feedback](https://doi.org/10.3102/0034654307313795).
- Dunlosky, J., et al. (2013). [Improving students’ learning with effective learning techniques](https://doi.org/10.1177/1529100612453266).
