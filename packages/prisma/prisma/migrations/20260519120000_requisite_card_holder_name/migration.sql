-- Add card holder full name to requisites (surname, given name, patronymic).
ALTER TABLE "requisites" ADD COLUMN "card_holder_name" TEXT NOT NULL DEFAULT '';
