# UOS Study Plans

Structure: `{college}/{level}/{program}/`

File naming: `{college}_{program}_{catalog-year}_study-plan_v{n}.pdf`
Example: `cci_msc-data-science_2025-26_study-plan_v1.pdf`

Rules: lowercase, hyphens inside fields, underscores between fields, English/ASCII only.
Catalog year = intake year the plan applies to. Superseded versions go in an `_archive/` folder inside the program folder.
After adding a PDF, fill in its row in `_meta/programs_index.csv`.

`year_basis` in programs_index.csv: `stated` = the PDF states the year; `pdf_date` = academic year taken from the PDF's last-modified date (unconfirmed, correct if wrong).
source_url is empty for now; the PDFs were provided directly.
