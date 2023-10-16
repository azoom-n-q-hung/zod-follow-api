## Environment:
    - Node 16
        + nvm install 16
        + nvm alias default 16
    - Docker

## Setup: Run commands
1, `yarn` Install packages

2, `yarn setup` clone the .env.template file to real .env

3, `yarn dcc:up` run up MySQL in Docker

4, `yarn prisma:migrate` sync Prisma model wich database

## Run API:
####  `yarn dev`

## Migrations:
1, Edit the model in ./prisma/schema.prisma

2, Reformat the prisma model file `yarn prisma format`

3, Create migration file `yarn prisma migrate dev --create-only --name <name_file>`

4, Run migration `yarn prisma:migrate`
