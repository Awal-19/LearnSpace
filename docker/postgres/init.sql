-- Runs once, on first start of the db volume.
-- Separate database for integration tests so they never touch dev data.
CREATE DATABASE learnspace_test;

