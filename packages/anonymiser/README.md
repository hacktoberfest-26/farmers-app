# Farmers anonymiser

`anonymise` and `anonymousPair` construct a new object from a caller-supplied controlled vocabulary. They have no database, framework, or network dependencies. Names, emails, account identifiers, course, year, private ideas, and arbitrary text are absent from the input contract and are never copied into the result.

Supply trusted category, skill, goal, and sport IDs. The result contains bounded canonical values and coarse weekly availability. It is data minimisation and pseudonymisation, not a guarantee that rare combinations cannot identify someone. Obtain consent before sending it to a hosted provider.

`scrubInterest` removes email, URL, and phone-like patterns from a separate free-text classification input. It cannot guarantee removal of a person's name. The interface must tell users to enter interests only. Pair scoring never consumes that text.

Run `npm test` at the repository root for the anonymiser and disclosure tests. This module is covered by the repository MIT license.
