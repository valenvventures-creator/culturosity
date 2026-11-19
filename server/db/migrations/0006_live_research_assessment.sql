-- Extra-deep search also assesses each suggestion: mobile app, who manages the program, and fit
-- for Culturosity's services. Facts must be sourced; the fit rating is labelled as an assessment.
alter table research_suggestions add column assessment jsonb;
