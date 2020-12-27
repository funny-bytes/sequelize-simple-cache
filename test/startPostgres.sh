#!/bin/sh

echo "start database..."

docker run --rm --name pgitest -e POSTGRES_PASSWORD=docker -d -p 5432:5432 postgres:11

sleep 3
while ! nc -z localhost 5432; do
  sleep 1
done

docker exec pgitest psql -U postgres \
  -c "CREATE USER itest WITH PASSWORD 'secret'" \
  -c "CREATE DATABASE itest" \
  -c "\c itest" \
  -c "GRANT ALL PRIVILEGES ON DATABASE itest TO itest" \
  -c "GRANT ALL PRIVILEGES ON SCHEMA public TO itest" \
  -c "\l" \
  -c "\du" \
  -c "\dn"
